import React, { useState, useRef, useEffect } from 'react';
import { X, Send, MessageSquare, Maximize2, Minimize2, Loader } from 'lucide-react';
import { callChatWithContext, generateSessionSummary } from '../services/chatService';
import { retrieveContext } from '../services/ragService';
import './AIChat.css';

export default function AIChat({ isFullscreen = false, onClose }) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'assistant',
      content: 'Hi! I\'m the DEVCON Kids AI Assistant. I can help you with:\n• DEVCON Kids mission and core pillars\n• Volunteer onboarding and guidelines\n• Event planning and coordination\n• Knowledge Base uploads and document questions\n• Dashboard access and role-based guidance\n\nTry one of the quick questions below, or ask something in your own words.',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(isFullscreen);
  const messagesEndRef = useRef(null);

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
    if (!text.trim()) return;

    const userMessage = {
      id: messages.length + 1,
      role: 'user',
      content: text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // Retrieve relevant context from knowledge base
      const context = await retrieveContext(text);

      // Call Gemini with RAG context
      const result = await callChatWithContext(text, context, 
        messages.map(m => ({ role: m.role, content: m.content }))
      );

      const assistantMessage = {
        id: messages.length + 2,
        role: 'assistant',
        content: result.response,
        citations: result.sources,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = {
        id: messages.length + 2,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again or contact support.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickPrompt = (prompt) => {
    handleSendMessage(prompt);
  };

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

        <div className="ai-chat-messages">
          {messages.map(msg => (
            <div key={msg.id} className={`message ${msg.role}`}>
              <div className="message-content">
                {msg.content}
              </div>
              {msg.citations && msg.citations.length > 0 && (
                <div className="message-citations">
                  <strong>Sources:</strong>
                  {msg.citations.map(c => (
                    <div key={c.id} className="citation">
                      [{c.id}] {c.title}
                    </div>
                  ))}
                </div>
              )}
              <span className="message-time">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
          {loading && (
            <div className="message assistant loading-message">
              <Loader size={20} className="spinner" />
              <span>Thinking...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="ai-chat-input-area">
          {messages.length === 1 && (
            <div className="suggested-prompts">
              <p>Quick questions:</p>
              <div className="prompts-grid">
                {suggestedPrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleQuickPrompt(prompt)}
                    className="quick-prompt-btn"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="chat-input-form">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleSendMessage()}
              placeholder="Ask me anything..."
              disabled={loading}
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={loading || !input.trim()}
              className="send-btn"
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Floating widget (collapsed)
  if (!isFullscreen) {
    return (
      <div className="ai-chat-widget">
        <button
          onClick={() => setExpanded(true)}
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

      <div className="ai-chat-messages">
        {messages.map(msg => (
          <div key={msg.id} className={`message ${msg.role}`}>
            <div className="message-content">
              {msg.content}
            </div>
            {msg.citations && msg.citations.length > 0 && (
              <div className="message-citations">
                <strong>Sources:</strong>
                {msg.citations.map(c => (
                  <div key={c.id} className="citation">
                    [{c.id}] {c.title}
                  </div>
                ))}
              </div>
            )}
            <span className="message-time">
              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
        {loading && (
          <div className="message assistant loading-message">
            <Loader size={20} className="spinner" />
            <span>Thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="ai-chat-input-area">
        {messages.length === 1 && (
          <div className="suggested-prompts">
            <p>Quick questions:</p>
            <div className="prompts-grid">
              {suggestedPrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleQuickPrompt(prompt)}
                  className="quick-prompt-btn"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="chat-input-form">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && handleSendMessage()}
            placeholder="Ask me anything..."
            disabled={loading}
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={loading || !input.trim()}
            className="send-btn"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
