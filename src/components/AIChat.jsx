import { useEffect, useRef, useState } from 'react';
import { X, Send, MessageSquare, Minimize2, Loader, Trash2, Copy, ThumbsUp, ThumbsDown, Check } from 'lucide-react';
import { callChatWithContext } from '../services/chatService';
import { retrieveContext } from '../services/ragService';
import { logQuestion } from '../services/faqService';
import { supabase } from '../lib/supabase';
import './AIChat.css';

export default function AIChat({ isFullscreen = false, onClose, onOpen }) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'assistant',
      content: 'Hi! I\'m the DEVCON Kids AI Assistant. I can help you with:\n• DEVCON Kids mission and core pillars\n• Volunteer onboarding and guidelines\n• Event planning and coordination\n• Knowledge Base uploads and document questions\n• Dashboard access and role-based guidance\n\nTry one of the quick questions below, or ask something in your own words.',
      timestamp: new Date(),
      meta: {
        label: 'Welcome'
      }
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(isFullscreen);
  const [copiedId, setCopiedId] = useState(null);
  const [feedbackGiven, setFeedbackGiven] = useState({});
  const messagesEndRef = useRef(null);
  const messageIdRef = useRef(1000);
  const activeAssistantMessageRef = useRef(null);
  const sessionIdRef = useRef(null);
  // AbortController for cancelling in-flight streaming requests
  const abortControllerRef = useRef(null);

  // Load chat history from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('chatHistory');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.messages?.length > 1) {
          setMessages(parsed.messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) })));
          sessionIdRef.current = parsed.sessionId || null;
          messageIdRef.current = Math.max(...parsed.messages.map(m => m.id)) + 1;
        }
      }
    } catch { /* ignore corrupt localStorage */ }
  }, []);

  // Save chat history to localStorage on change
  useEffect(() => {
    if (messages.length > 1) {
      try {
        localStorage.setItem('chatHistory', JSON.stringify({
          sessionId: sessionIdRef.current,
          messages: messages.filter(m => !m.isStreaming)
        }));
      } catch { /* localStorage full or unavailable */ }
    }
  }, [messages]);

  /**
   * Clear conversation — reset to welcome message, start fresh session
   */
  const handleClearChat = () => {
    setMessages([{
      id: messageIdRef.current++,
      role: 'assistant',
      content: 'Hi! I\'m the DEVCON Kids AI Assistant. I can help you with:\n• DEVCON Kids mission and core pillars\n• Volunteer onboarding and guidelines\n• Event planning and coordination\n• Knowledge Base uploads and document questions\n• Dashboard access and role-based guidance\n\nTry one of the quick questions below, or ask something in your own words.',
      timestamp: new Date(),
      meta: { label: 'Welcome' }
    }]);
    sessionIdRef.current = null;
    setFeedbackGiven({});
    localStorage.removeItem('chatHistory');
  };

  /**
   * Copy an assistant message's text to clipboard
   */
  const handleCopy = async (msgId, content) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* clipboard API unavailable */ }
  };

  /**
   * Submit feedback (👍/👎) for a message.
   * Persists to Supabase ai_chat_feedback (non-blocking, best-effort).
   * Falls back to local state only if DB write fails.
   */
  const handleFeedback = async (msgId, isPositive) => {
    setFeedbackGiven(prev => ({ ...prev, [msgId]: isPositive ? 'up' : 'down' }));

    // Best-effort persist to Supabase — don't block UI or show errors
    try {
      const msg = messages.find(m => m.id === msgId);
      await supabase.from('ai_chat_feedback').insert({
        message_content: (msg?.content || '').substring(0, 500),
        feedback: isPositive ? 'positive' : 'negative',
        created_at: new Date().toISOString()
      });
    } catch { /* non-blocking — local state is sufficient fallback */ }
  };

  // Suggested prompts based on context
  const suggestedPrompts = [
    'Tell me about DEVCON Kids mission',
    'What can the dashboard pages do?',
    'How do I onboard a new volunteer?',
    'What is the process for creating an event?',
    'What are the volunteer guidelines?'
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (text = input) => {
    if (!text.trim() || loading) return;

    // Input length guard — prevent massive prompts that exceed TPM budget
    const trimmedText = text.trim().slice(0, 500);

    const userMessage = {
      id: messageIdRef.current++,
      role: 'user',
      content: trimmedText,
      timestamp: new Date()
    };

    const assistantMessageId = messageIdRef.current++;
    activeAssistantMessageRef.current = assistantMessageId;

    setMessages(prev => [
      ...prev,
      userMessage,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
        meta: {
          label: 'Thinking...'
        }
      }
    ]);
    setInput('');
    setLoading(true);

    // Create AbortController for this request (enables "Stop generating")
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const requestStartedAt = performance.now();
    // Fix #3: Filter history to exclude empty/streaming messages before sending to LLM
    const history = messages
      .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content && !m.isStreaming)
      .slice(-10);

    try {
      const context = await retrieveContext(trimmedText, history);
      const confidence = context._confidence || { level: 'high', suggestion: null };

      // Check if user cancelled during retrieval
      if (controller.signal.aborted) return;

      let streamedText = '';
      let firstTokenSeen = false;

      const result = await callChatWithContext(trimmedText, context, history, {
        onFirstToken: () => {
          firstTokenSeen = true;
          setMessages((prev) => prev.map((msg) => (
            msg.id === assistantMessageId
              ? { ...msg, isStreaming: false, meta: { label: 'Streaming' } }
              : msg
          )));
        },
        onDelta: (delta) => {
          // Stop updating if user cancelled
          if (controller.signal.aborted) return;
          streamedText += delta;
          setMessages((prev) => prev.map((msg) => (
            msg.id === assistantMessageId
              ? { ...msg, content: streamedText, isStreaming: !firstTokenSeen }
              : msg
          )));
        }
      });

      // Don't overwrite if user cancelled mid-stream
      if (controller.signal.aborted) return;

      const responseTimeMs = Math.max(1, Math.round(performance.now() - requestStartedAt));
      const tokenCount = result.metrics?.outputTokens || Math.max(1, Math.ceil(result.response.length / 4));

      setMessages((prev) => prev.map((msg) => (
        msg.id === assistantMessageId
          ? {
              ...msg,
              content: result.response,
              citations: result.sources,
              isStreaming: false,
              timestamp: new Date(),
              confidence,
              meta: {
                label: `${responseTimeMs} ms`,
                responseTimeMs,
                tokenCount,
                model: result.model,
                apiUsed: result.apiUsed
              }
            }
          : msg
      )));

      // FAQ Auto-Builder: log the question with confidence (non-blocking)
      logQuestion(trimmedText, confidence.level).catch(() => {});
    } catch (error) {
      if (controller.signal.aborted) return; // User cancelled — not an error
      console.error('Chat error:', error);
      // Fix #2: Use captured assistantMessageId, not the ref (prevents race condition)
      setMessages((prev) => prev.map((msg) => (
        msg.id === assistantMessageId
          ? {
              ...msg,
              content: 'Sorry, I ran into a problem generating that answer. Please try again in a moment.',
              isStreaming: false,
              isError: true,
              meta: {
                label: 'Unavailable'
              }
            }
          : msg
      )));
    } finally {
      setLoading(false);
      activeAssistantMessageRef.current = null;
      abortControllerRef.current = null;
    }
  };

  /**
   * Stop generating — aborts the current streaming request
   */
  const handleStopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
    // Mark the streaming message as complete with whatever content it has
    setMessages((prev) => prev.map((msg) => (
      msg.isStreaming ? { ...msg, isStreaming: false, meta: { label: 'Stopped' } } : msg
    )));
  };

  const handleQuickPrompt = (prompt) => {
    handleSendMessage(prompt);
  };

  const renderMarkdown = (content) => {
    if (!content) return null;

    const blocks = parseMarkdownBlocks(content);

    return blocks.map((block, blockIndex) => {
      if (block.type === 'heading') {
        return (
          <div key={`heading-${blockIndex}`} className="markdown-heading">
            {renderInlineMarkdown(block.text, `heading-${blockIndex}`)}
          </div>
        );
      }

      if (block.type === 'paragraph') {
        return (
          <p key={`paragraph-${blockIndex}`} className="markdown-paragraph">
            {renderInlineMarkdown(block.text, `paragraph-${blockIndex}`)}
          </p>
        );
      }

      if (block.type === 'list') {
        const ListTag = block.ordered ? 'ol' : 'ul';
        return (
          <ListTag key={`list-${blockIndex}`} className={`markdown-list ${block.ordered ? 'ordered' : 'unordered'}`}>
            {block.items.map((item, itemIndex) => (
              <li key={`item-${blockIndex}-${itemIndex}`}>{renderInlineMarkdown(item, `item-${blockIndex}-${itemIndex}`)}</li>
            ))}
          </ListTag>
        );
      }

      if (block.type === 'code') {
        return (
          <pre key={`code-${blockIndex}`} className="markdown-code-block">
            <code>{block.text}</code>
          </pre>
        );
      }

      return null;
    });
  };

  const renderMessage = (msg) => (
    <div key={msg.id} className={`message ${msg.role} ${msg.isError ? 'error' : ''}`}>
      <div className={`message-content ${msg.role === 'assistant' ? 'markdown-content' : ''}`}>
        {msg.role === 'assistant' && msg.isStreaming && !msg.content ? (
          <div className="typing-indicator">
            <Loader size={16} className="spinner" />
            <span>Thinking...</span>
          </div>
        ) : msg.role === 'assistant' ? (
          renderMarkdown(msg.content)
        ) : (
          <span className="plain-message">{msg.content}</span>
        )}
      </div>
      {/* Show sources only when confidence is not 'none' or 'low' and there are citations */}
      {msg.citations && msg.citations.length > 0 && (!msg.confidence || msg.confidence.level === 'high' || msg.confidence.level === 'medium') && (
        <div className="message-citations">
          <strong>Sources:</strong>
          {[...new Map(msg.citations.map(c => [c.title, c])).values()].map((c, idx) => (
            <div key={c.documentId || idx} className="citation">
              [{idx + 1}] {c.title}
            </div>
          ))}
        </div>
      )}
      {/* Smart Doc Suggestion — shown when confidence is low/none */}
      {msg.confidence && (msg.confidence.level === 'low' || msg.confidence.level === 'none') && msg.confidence.suggestion && (
        <div className="doc-suggestion-banner">
          <div className="doc-suggestion-icon">📄</div>
          <div className="doc-suggestion-text">
            <strong>Knowledge gap detected</strong>
            <p>I couldn't find strong matches in the Knowledge Base. Consider uploading a document about: <em>{msg.confidence.suggestion}</em></p>
          </div>
        </div>
      )}
      {msg.confidence && msg.confidence.level === 'medium' && msg.confidence.suggestion && (
        <div className="doc-suggestion-banner mild">
          <div className="doc-suggestion-icon">💡</div>
          <div className="doc-suggestion-text">
            <strong>Partial match</strong>
            <p>I found some related info, but more docs about <em>{msg.confidence.suggestion}</em> would improve my answers.</p>
          </div>
        </div>
      )}
      {/* Action buttons for assistant messages (not welcome, not streaming) */}
      {msg.role === 'assistant' && msg.content && !msg.isStreaming && msg.meta?.label !== 'Welcome' && (
        <div className="message-actions">
          <button
            className={`action-btn ${copiedId === msg.id ? 'active' : ''}`}
            onClick={() => handleCopy(msg.id, msg.content)}
            title="Copy response"
          >
            {copiedId === msg.id ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button
            className={`action-btn ${feedbackGiven[msg.id] === 'up' ? 'active' : ''}`}
            onClick={() => handleFeedback(msg.id, true)}
            title="Good response"
            disabled={!!feedbackGiven[msg.id]}
          >
            <ThumbsUp size={14} />
          </button>
          <button
            className={`action-btn ${feedbackGiven[msg.id] === 'down' ? 'active' : ''}`}
            onClick={() => handleFeedback(msg.id, false)}
            title="Bad response"
            disabled={!!feedbackGiven[msg.id]}
          >
            <ThumbsDown size={14} />
          </button>
        </div>
      )}
      <div className="message-footer">
        <span className="message-time">
          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        {msg.meta?.tokenCount || msg.meta?.responseTimeMs ? (
          <span className="message-metrics">
            {msg.meta.responseTimeMs ? `${msg.meta.responseTimeMs} ms` : msg.meta.label}
            {msg.meta.tokenCount ? ` • ${msg.meta.tokenCount} tokens` : ''}
          </span>
        ) : null}
      </div>
    </div>
  );

  const renderQuickQuestions = () => (
    messages.length === 1 ? (
      <div className="suggested-prompts">
        <p>Quick questions:</p>
        <div className="prompts-grid">
          {suggestedPrompts.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleQuickPrompt(prompt)}
              className="quick-prompt-btn"
              disabled={loading}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    ) : null
  );

  const renderComposer = () => (
    <div className="chat-input-form">
      {/* Kenneth's char counter wrapper + stop button; Precious's aria attributes */}
      <div className="chat-input-wrapper">
        <input
          aria-label="Message the DEVCON Kids AI assistant"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
          placeholder="Ask me anything..."
          disabled={loading}
          maxLength={500}
        />
        <span className={`char-counter ${input.length > 400 ? 'visible' : ''} ${input.length >= 500 ? 'limit' : input.length > 400 ? 'warning' : ''}`}>
          {input.length}/500
        </span>
      </div>
      {loading ? (
        <button
          type="button"
          onClick={handleStopGenerating}
          className="send-btn"
          title="Stop generating"
          aria-label="Stop generating"
          style={{ background: '#ef4444' }}
        >
          <X size={20} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => handleSendMessage()}
          disabled={!input.trim()}
          className="send-btn"
          aria-label="Send message"
        >
          <Send size={20} />
        </button>
      )}
    </div>
  );

  const renderConversation = () => (
    <div className="ai-chat-messages">
      {messages.map(renderMessage)}
      <div ref={messagesEndRef} />
    </div>
  );

  if (expanded && !isFullscreen) {
    return (
      <div className="ai-chat-fullscreen">
        <div className="ai-chat-header">
          <h2>DEVCON Kids AI Assistant</h2>
          <div className="ai-header-actions">
            <button onClick={handleClearChat} className="icon-btn" title="Clear conversation">
              <Trash2 size={20} />
            </button>
            <button onClick={() => setExpanded(false)} className="icon-btn" title="Minimize">
              <Minimize2 size={20} />
            </button>
            <button onClick={onClose} className="icon-btn" title="Close">
              <X size={20} />
            </button>
          </div>
        </div>

        {renderConversation()}

        <div className="ai-chat-input-area">
          {renderQuickQuestions()}
          {renderComposer()}
        </div>
      </div>
    );
  }

// Floating widget (collapsed)
  if (!isFullscreen) {
    return (
      <div className="ai-chat-widget">
        <button
          onClick={() => {
            setExpanded(true);
            if (onOpen) onOpen();
          }}
          className="chat-toggle-btn"
          title="Open AI Assistant"
        >
          <MessageSquare size={24} />
        </button>
      </div>
    );
  }

  // Fullscreen mode
  return (
    <div className="ai-chat-fullscreen-page">
      <div className="ai-chat-header">
        <h2>DEVCON Kids AI Assistant</h2>
        <div className="ai-header-actions">
          <button onClick={handleClearChat} className="icon-btn" title="Clear conversation">
            <Trash2 size={20} />
          </button>
          <button onClick={onClose} className="icon-btn">
            <X size={20} />
          </button>
        </div>
      </div>

      {renderConversation()}

      <div className="ai-chat-input-area">
        {renderQuickQuestions()}
        {renderComposer()}
      </div>
    </div>
  );
}

function parseMarkdownBlocks(text) {
  const lines = String(text || '').split(/\r?\n/);
  const blocks = [];
  let paragraph = [];
  let list = null;
  let codeLines = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    blocks.push(list);
    list = null;
  };

  const flushCode = () => {
    if (!codeLines) return;
    blocks.push({ type: 'code', text: codeLines.join('\n') });
    codeLines = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (codeLines) {
        flushCode();
      } else {
        flushParagraph();
        flushList();
        codeLines = [];
      }
      continue;
    }

    if (codeLines) {
      codeLines.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    if (/^#{1,3}\s+/.test(trimmed)) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'heading', text: trimmed.replace(/^#{1,3}\s+/, '') });
      continue;
    }

    if (/^[-*•]\s+/.test(trimmed)) {
      flushParagraph();
      if (!list || list.ordered) {
        flushList();
        list = { type: 'list', ordered: false, items: [] };
      }
      list.items.push(trimmed.replace(/^[-*•]\s+/, ''));
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph();
      if (!list || !list.ordered) {
        flushList();
        list = { type: 'list', ordered: true, items: [] };
      }
      list.items.push(trimmed.replace(/^\d+\.\s+/, ''));
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  flushCode();

  return blocks;
}

function renderInlineMarkdown(text, prefix) {
  const segments = String(text || '').split(/(\*\*[^*]+\*\*)/g).filter(Boolean);

  return segments.map((segment, index) => {
    if (segment.startsWith('**') && segment.endsWith('**')) {
      return <strong key={`${prefix}-strong-${index}`}>{segment.slice(2, -2)}</strong>;
    }

    return segment.split(/(`[^`]+`)/g).filter(Boolean).map((part, partIndex) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={`${prefix}-code-${index}-${partIndex}`}>{part.slice(1, -1)}</code>;
      }

      return <span key={`${prefix}-text-${index}-${partIndex}`}>{part}</span>;
    });
  });
}
