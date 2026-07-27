import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Trash2, Loader, HelpCircle, TrendingUp, AlertTriangle } from 'lucide-react';
import { getFAQSuggestions, updateSuggestionStatus, deleteSuggestion, getQuestionStats } from '../services/faqService';
import { useApp } from '../context/AppState';
import './FAQSuggestions.css';

export default function FAQSuggestions() {
  const { user } = useApp();
  const [suggestions, setSuggestions] = useState([]);
  const [stats, setStats] = useState({ totalQuestions: 0, lowConfidence: 0, pendingSuggestions: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    loadData();
  }, [filter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [suggestionsData, statsData] = await Promise.all([
        getFAQSuggestions(filter),
        getQuestionStats()
      ]);
      setSuggestions(suggestionsData);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load FAQ data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    setActionLoading(id);
    const success = await updateSuggestionStatus(id, 'approved', user?.id);
    if (success) {
      setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status: 'approved' } : s));
    }
    setActionLoading(null);
  };

  const handleDismiss = async (id) => {
    setActionLoading(id);
    const success = await updateSuggestionStatus(id, 'dismissed', user?.id);
    if (success) {
      setSuggestions(prev => prev.filter(s => s.id !== id));
    }
    setActionLoading(null);
  };

  const handleDelete = async (id) => {
    setActionLoading(id);
    const success = await deleteSuggestion(id);
    if (success) {
      setSuggestions(prev => prev.filter(s => s.id !== id));
    }
    setActionLoading(null);
  };

  return (
    <div className="faq-suggestions-page">
      <div className="faq-header">
        <div>
          <h1>FAQ Auto-Builder</h1>
          <p className="faq-subtitle">
            Questions are tracked automatically. When a topic is asked 3+ times, it appears here as a suggestion.
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="faq-stats">
        <div className="stat-card">
          <div className="stat-icon questions">
            <HelpCircle size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats.totalQuestions}</span>
            <span className="stat-label">Total Questions</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon low-conf">
            <AlertTriangle size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats.lowConfidence}</span>
            <span className="stat-label">Low Confidence</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon pending">
            <TrendingUp size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats.pendingSuggestions}</span>
            <span className="stat-label">Pending Suggestions</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="faq-filters">
        {['pending', 'approved', 'dismissed', 'all'].map((f) => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Suggestions List */}
      <div className="faq-list">
        {loading ? (
          <div className="faq-loading">
            <Loader size={24} className="spinner" />
            <span>Loading suggestions...</span>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="faq-empty">
            <HelpCircle size={48} />
            <h3>No suggestions yet</h3>
            <p>
              {filter === 'pending'
                ? 'When users ask the chatbot similar questions 3+ times, suggestions will appear here.'
                : `No ${filter} suggestions found.`}
            </p>
          </div>
        ) : (
          suggestions.map((suggestion) => (
            <div key={suggestion.id} className={`faq-card ${suggestion.status}`}>
              <div className="faq-card-header">
                <div className="faq-topic">
                  <span className="topic-label">Topic:</span>
                  <span className="topic-value">{suggestion.topic}</span>
                </div>
                <div className="faq-count">
                  <span className="count-badge">{suggestion.question_count}x asked</span>
                </div>
              </div>

              <div className="faq-samples">
                <span className="samples-label">Sample questions:</span>
                <ul>
                  {(suggestion.sample_questions || []).slice(0, 3).map((q, idx) => (
                    <li key={idx}>"{q}"</li>
                  ))}
                </ul>
              </div>

              {suggestion.suggested_answer && (
                <div className="faq-answer">
                  <span className="answer-label">Suggested answer:</span>
                  <p>{suggestion.suggested_answer}</p>
                </div>
              )}

              <div className="faq-card-actions">
                {suggestion.status === 'pending' && (
                  <>
                    <button
                      className="faq-action-btn approve"
                      onClick={() => handleApprove(suggestion.id)}
                      disabled={actionLoading === suggestion.id}
                      title="Approve — add to Knowledge Base"
                    >
                      <CheckCircle size={16} />
                      <span>Approve</span>
                    </button>
                    <button
                      className="faq-action-btn dismiss"
                      onClick={() => handleDismiss(suggestion.id)}
                      disabled={actionLoading === suggestion.id}
                      title="Dismiss — not useful"
                    >
                      <XCircle size={16} />
                      <span>Dismiss</span>
                    </button>
                  </>
                )}
                <button
                  className="faq-action-btn delete"
                  onClick={() => handleDelete(suggestion.id)}
                  disabled={actionLoading === suggestion.id}
                  title="Delete permanently"
                >
                  <Trash2 size={16} />
                </button>
                {actionLoading === suggestion.id && (
                  <Loader size={16} className="spinner" />
                )}
              </div>

              {suggestion.status !== 'pending' && (
                <div className={`faq-status-badge ${suggestion.status}`}>
                  {suggestion.status}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
