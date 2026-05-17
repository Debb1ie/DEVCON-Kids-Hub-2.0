import { useEffect, useRef, useState } from 'react';
import { X, Send, MessageSquare, Minimize2, Loader } from 'lucide-react';
import { callChatWithContext } from '../services/chatService';
import { retrieveContext } from '../services/ragService';
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
  const messagesEndRef = useRef(null);
  const messageIdRef = useRef(1000);
  const activeAssistantMessageRef = useRef(null);

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

    const userMessage = {
      id: messageIdRef.current++,
      role: 'user',
      content: text,
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

    const requestStartedAt = performance.now();
    const history = [...messages, userMessage].slice(-10);

    try {
      const context = await retrieveContext(text);

      let streamedText = '';
      let firstTokenSeen = false;

      const result = await callChatWithContext(text, context, history, {
        onFirstToken: () => {
          firstTokenSeen = true;
          setMessages((prev) => prev.map((msg) => (
            msg.id === assistantMessageId
              ? { ...msg, isStreaming: false, meta: { label: 'Streaming' } }
              : msg
          )));
        },
        onDelta: (delta) => {
          streamedText += delta;
          setMessages((prev) => prev.map((msg) => (
            msg.id === assistantMessageId
              ? { ...msg, content: streamedText, isStreaming: !firstTokenSeen }
              : msg
          )));
        }
      });

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
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => prev.map((msg) => (
        msg.id === activeAssistantMessageRef.current
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
    }
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
      {msg.citations && msg.citations.length > 0 && (
        <div className="message-citations">
          <strong>Sources:</strong>
          {msg.citations.map((c) => (
            <div key={c.id} className="citation">
              [{c.id}] {c.title}
            </div>
          ))}
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
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
        placeholder="Ask me anything..."
        disabled={loading}
      />
      <button
        type="button"
        onClick={() => handleSendMessage()}
        disabled={loading || !input.trim()}
        className="send-btn"
      >
        <Send size={20} />
      </button>
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
        <button onClick={onClose} className="icon-btn">
          <X size={20} />
        </button>
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
