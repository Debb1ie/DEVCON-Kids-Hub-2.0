import { useEffect, useRef, useState } from 'react';
import { X, Send, MessageSquare, Maximize2, Minimize2, Loader, Trash2, Copy, ThumbsUp, ThumbsDown, Check, Bot, FileText } from 'lucide-react';
import { callChatWithContext } from '../services/chatService';
import { logQuestion } from '../services/faqService';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppState';
import { clearLegacySharedChatHistory, clearPrivateChatHistory, loadPrivateChatHistory } from '../services/chatHistoryService';
import './AIChat.css';

const welcomeMessage = () => ({
  id: crypto.randomUUID(),
  role: 'assistant',
  content: 'Hi! How can I help?',
  timestamp: new Date(),
  meta: { label: 'Welcome' },
});

export default function AIChat() {
  const { user, authSessionReady } = useApp();
  const [messages, setMessages] = useState(() => [welcomeMessage()]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(() => sessionStorage.getItem('devcon-assistant-mode') === 'expanded');
  const [hasNewResponse, setHasNewResponse] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [feedbackGiven, setFeedbackGiven] = useState({});
  const messagesEndRef = useRef(null);
  const messagesRef = useRef(null);
  const launcherRef = useRef(null);
  const composerRef = useRef(null);
  const wasNearBottomRef = useRef(true);
  const messageIdRef = useRef(1000);
  const activeAssistantMessageRef = useRef(null);
  const sessionIdRef = useRef(null);
  // AbortController for cancelling in-flight streaming requests
  const abortControllerRef = useRef(null);

  // Remove the legacy cross-user cache and load only UUID-owned RLS data.
  useEffect(() => {
    let active = true;
    clearLegacySharedChatHistory();
    // State is reset here because the authenticated owner changed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistoryLoading(true);
    setHistoryError('');
    setMessages([welcomeMessage()]);
    sessionIdRef.current = null;
    loadPrivateChatHistory(user?.id).then((history) => {
      if (!active) return;
      sessionIdRef.current = history.sessionId;
      setMessages(history.messages.length ? [welcomeMessage(), ...history.messages] : [welcomeMessage()]);
    }).catch(() => active && setHistoryError('Unable to load your private chat history.')).finally(() => active && setHistoryLoading(false));
    return () => { active = false; };
  }, [user?.id]);

  /**
   * Clear conversation — reset to welcome message, start fresh session
   */
  const handleClearChat = async () => {
    const sessionId = sessionIdRef.current;
    sessionIdRef.current = null;
    setMessages([welcomeMessage()]);
    setFeedbackGiven({});
    try { await clearPrivateChatHistory(sessionId, user?.id); }
    catch { setHistoryError('Unable to clear your private chat history.'); }
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
  const roleKey = user?.roleKey || 'pending_volunteer';
  const suggestedPrompts = roleKey === 'volunteer'
    ? ['Show my recent events.', 'Explain how Post Event Reports work.', 'What are the volunteer guidelines?']
    : roleKey === 'event_coordinator'
      ? ['Show my recent events.', 'Which Post Event Reports are still incomplete?', 'Summarize approved event impact.']
      : ['Which Post Event Reports are still incomplete?', 'Summarize approved event impact.', 'How many learners were reported this month?', 'Explain how Post Event Reports work.'];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (wasNearBottomRef.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        setHasNewResponse(false);
      } else if (messages.length > 1) {
        setHasNewResponse(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [messages]);

  useEffect(() => {
    sessionStorage.setItem('devcon-assistant-mode', expanded ? 'expanded' : 'compact');
  }, [expanded]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        window.setTimeout(() => launcherRef.current?.focus(), 0);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    window.setTimeout(() => composerRef.current?.focus(), 0);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const closeAssistant = () => {
    setOpen(false);
    window.setTimeout(() => launcherRef.current?.focus(), 0);
  };

  const handleConversationScroll = (event) => {
    const element = event.currentTarget;
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 72;
    wasNearBottomRef.current = nearBottom;
    if (nearBottom) setHasNewResponse(false);
  };

  const handleSendMessage = async (text = input) => {
    if (!text.trim() || loading) return;
    if (!authSessionReady) {
      setHistoryError('Your secure session is still loading. Please retry in a moment.');
      return;
    }

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

    // Fix #3: Filter history to exclude empty/streaming messages before sending to LLM
    const history = messages
      .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content && !m.isStreaming)
      .slice(-10);

    try {
      let streamedText = '';
      let firstTokenSeen = false;

      const result = await callChatWithContext(trimmedText, [], history, {
        sessionId: sessionIdRef.current,
        signal: controller.signal,
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
      sessionIdRef.current = result.sessionId;
      const confidence = { level: result.sources?.length ? 'high' : 'none', suggestion: null };

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
                label: 'Complete'
              }
            }
          : msg
      )));

      // FAQ Auto-Builder: log the question with confidence (non-blocking)
      logQuestion(trimmedText, confidence.level).catch(() => {});
    } catch {
      if (controller.signal.aborted) return; // User cancelled — not an error
      // Fix #2: Use captured assistantMessageId, not the ref (prevents race condition)
      setMessages((prev) => prev.map((msg) => (
        msg.id === assistantMessageId
          ? {
              ...msg,
              content: 'The AI assistant is temporarily unavailable. Please try again shortly.',
              isStreaming: false,
              isError: true,
              meta: {
                label: 'Unavailable',
                retryText: trimmedText,
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
      {msg.role === 'assistant' && <div className="message-avatar" aria-hidden="true"><Bot size={16} /></div>}
      <div className="message-body">
      <div className={`message-content ${msg.role === 'assistant' ? 'markdown-content' : ''}`}>
        {msg.role === 'assistant' && msg.isStreaming && !msg.content ? (
          <div className="typing-indicator" role="status" aria-label="Checking Hub data">
            <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
            <span className="typing-label">Checking Hub data…</span>
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
          <strong>Sources · {msg.citations.length}</strong>
          {[...new Map(msg.citations.map(c => [`${c.type || ''}:${c.id || c.documentId || c.title}`, c])).values()].map((c, idx) => (
            <div key={c.id || c.documentId || idx} className="citation">
              <FileText size={14} aria-hidden="true" />
              {c.route ? <a href={c.route}>{c.title}<small>{c.type || 'Hub source'}{c.pageNumber ? ` · Page ${c.pageNumber}` : ''}</small></a> : <span>{c.title}<small>{c.type || 'Hub source'}{c.pageNumber ? ` · Page ${c.pageNumber}` : ''}</small></span>}
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
            aria-label="Copy response"
          >
            {copiedId === msg.id ? <Check size={14} /> : <Copy size={14} />}
          </button>
          {msg.isError && msg.meta?.retryText && (
            <button type="button" className="action-btn" onClick={() => handleSendMessage(msg.meta.retryText)} disabled={loading} title="Retry question">
              Retry
            </button>
          )}
          <button
            className={`action-btn ${feedbackGiven[msg.id] === 'up' ? 'active' : ''}`}
            onClick={() => handleFeedback(msg.id, true)}
            title="Good response"
            aria-label="Good response"
            disabled={!!feedbackGiven[msg.id]}
          >
            <ThumbsUp size={14} />
          </button>
          <button
            className={`action-btn ${feedbackGiven[msg.id] === 'down' ? 'active' : ''}`}
            onClick={() => handleFeedback(msg.id, false)}
            title="Bad response"
            aria-label="Bad response"
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
    </div>
  );

  const renderQuickQuestions = () => (
    messages.length === 1 ? (
      <div className="suggested-prompts">
        <p>Ask about DEVCON Kids events, chapters, reports, impact data, or Hub resources.</p>
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
        <textarea
          ref={composerRef}
          aria-label="Message the DEVCON Kids AI assistant"
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, 500))}
          onInput={(e) => {
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 112)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          placeholder="Ask about events, reports, or impact…"
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
    <div className="ai-chat-messages" ref={messagesRef} onScroll={handleConversationScroll}>
      {historyLoading && <div className="chat-history-state" role="status"><Loader size={16} className="spinner" /> Loading your conversation…</div>}
      {historyError && <div className="chat-history-state error" role="alert">{historyError}</div>}
      {messages.map(renderMessage)}
      <div ref={messagesEndRef} />
    </div>
  );

  if (!open) {
    return (
      <div className="ai-chat-widget">
        <button
          ref={launcherRef}
          onClick={() => setOpen(true)}
          className="chat-toggle-btn"
          aria-label="Open DEVCON Kids Assistant"
        >
          <MessageSquare size={24} />
        </button>
      </div>
    );
  }

  return (
    <section className={`ai-chat-shell ${expanded ? 'is-expanded' : 'is-compact'}`} aria-label="DEVCON Kids Assistant">
      <div className="ai-chat-header">
        <div className="assistant-identity">
          <span className="assistant-avatar" aria-hidden="true"><Bot size={20} /></span>
          <div><h2>DEVCON Kids Assistant</h2><p>Hub AI <span>•</span> Ready</p></div>
        </div>
        <div className="ai-header-actions">
          {expanded && <button type="button" onClick={handleClearChat} className="icon-btn" aria-label="Clear conversation" title="Clear conversation">
            <Trash2 size={20} />
          </button>}
          <button type="button" onClick={() => setExpanded(value => !value)} className="icon-btn" aria-label={expanded ? 'Return to compact view' : 'Expand assistant'} title={expanded ? 'Return to compact view' : 'Expand assistant'}>
            {expanded ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
          <button type="button" onClick={closeAssistant} className="icon-btn" aria-label="Close assistant" title="Close assistant">
            <X size={20} />
          </button>
        </div>
      </div>
      <div className="ai-chat-workspace">
        {renderConversation()}
        {hasNewResponse && <button type="button" className="new-response-btn" onClick={() => { wasNearBottomRef.current = true; messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); setHasNewResponse(false); }}>↓ New response</button>}
        <div className="ai-chat-input-area">
          {renderQuickQuestions()}
          {renderComposer()}
          <p className="composer-note">AI can make mistakes. Verify important information.</p>
        </div>
      </div>
    </section>
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
