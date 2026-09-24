import { supabase } from '../lib/supabase';

const toMessage = (row) => ({
  id: row.id,
  role: row.role,
  content: row.content,
  citations: row.citations || [],
  timestamp: new Date(row.created_at),
  meta: { label: 'Saved' },
});

export async function loadPrivateChatHistory(userId) {
  if (!userId) return { sessionId: null, messages: [] };
  const session = await supabase.from('ai_chat_sessions')
    .select('id').eq('user_id', userId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (session.error) throw new Error('Unable to load your conversation history.');
  if (!session.data) return { sessionId: null, messages: [] };
  const messages = await supabase.from('ai_chat_messages')
    .select('id, role, content, citations, created_at')
    .eq('session_id', session.data.id).eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (messages.error) throw new Error('Unable to load your conversation history.');
  return { sessionId: session.data.id, messages: (messages.data || []).map(toMessage) };
}

export async function clearPrivateChatHistory(sessionId, userId) {
  if (!sessionId || !userId) return;
  const result = await supabase.from('ai_chat_sessions').delete().eq('id', sessionId).eq('user_id', userId);
  if (result.error) throw new Error('Unable to clear your conversation history.');
}

export function clearLegacySharedChatHistory() {
  try { localStorage.removeItem('chatHistory'); } catch { /* unavailable */ }
}
