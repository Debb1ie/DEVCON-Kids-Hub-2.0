# AI Features Setup Guide

## Quick Setup (3 steps)

### 1. Get API Keys (both free)

**Groq (chat):**
- Go to https://console.groq.com/keys
- Create a key → add to `.env`:
```
VITE_GROQ_API_KEY=your_key_here
```

**Mistral (embeddings):**
- Go to https://console.mistral.ai/api-keys
- Create a key → add to `.env`:
```
VITE_MISTRAL_API_KEY=your_key_here
```

### 2. Setup Supabase Database

Run the SQL migration to create AI tables:

1. Open your Supabase project dashboard
2. Go to **SQL Editor → New Query**
3. Paste the contents of: `supabase/migrations/20260710_mistral_embeddings_1024.sql`
4. Click **Run**

This creates: `documents`, `knowledge_base` (with 1024-dim vectors), `ai_chat_sessions`, `ai_chat_messages`, `ai_config`, and the `search_knowledge_base()` function.

### 3. Install Dependencies & Run

```bash
npm install
npm run dev
```

That's it. The chatbot and knowledge base should work.

---

## Architecture

### AI Stack

| Concern | Provider | Model | Cost |
|---------|----------|-------|------|
| Chat/LLM | Groq | Llama 3.3 70B Versatile | Free (30 req/min) |
| Embeddings | Mistral | mistral-embed (1024-dim) | Free (1M tokens/mo) |
| Vector DB | Supabase | Postgres + pgvector | Free tier |
| Auth | Supabase | Google OAuth | Free |

### Services

| File | Purpose |
|------|---------|
| `src/services/chatService.js` | Groq API calls, streaming, retries, caching |
| `src/services/ragService.js` | Mistral embeddings, vector search, document storage |
| `src/services/documentService.js` | PDF/DOCX/TXT parsing and chunking |

### Flow

```
User asks question
    → AIChat.jsx
    → ragService.retrieveContext(question)
        → Mistral generates query embedding (1024-dim)
        → Supabase pgvector finds similar document chunks
    → chatService.callChatWithContext(question, context, history)
        → System prompt includes matched document chunks
        → Groq/Llama generates answer with citations
    → Response displayed with source references
```

### Upload Flow

```
User uploads PDF/DOCX/TXT
    → documentService.processDocument(file)
        → Parse file → split into ~1000-char chunks
    → ragService.storeDocumentChunks(id, title, chunks)
        → Mistral embeds each chunk (1024-dim vector)
        → Stored in Supabase knowledge_base table
    → Document appears in Knowledge Base list
```

---

## Pages

| Page | URL | Access | Purpose |
|------|-----|--------|---------|
| Knowledge Base | `/dashboard/knowledge-base` | All users | Upload/manage documents for AI |
| AI Settings | `/dashboard/ai-settings` | Superadmin | Configure chatbot behavior |

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `VITE_GROQ_API_KEY` | Yes | Groq API for chat (Llama 3.3 70B) |
| `VITE_MISTRAL_API_KEY` | Yes | Mistral API for embeddings |

Copy `.env.example` to `.env` and fill in your values.

> **Security note:** In Phase 2, API keys will move to Supabase Edge Functions (server-side). The `VITE_` prefix keys are temporary for development.

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `documents` | Upload metadata (filename, type, pages, chunks) |
| `knowledge_base` | Text chunks + 1024-dim embedding vectors |
| `ai_chat_sessions` | Chat session metadata |
| `ai_chat_messages` | Individual messages per session |
| `ai_config` | Admin-configurable AI settings |

---

## Troubleshooting

### "Storage may have failed" on upload
- The `documents` and `knowledge_base` tables don't exist yet
- Run the migration SQL in Supabase SQL Editor

### Chat works but doesn't reference uploaded docs
- Embeddings might not be stored (check if Mistral key is set)
- The `knowledge_base` table might be empty — check in Supabase Table Editor
- Similarity threshold (0.7) might be too high for your query — try more specific questions

### "No VITE_MISTRAL_API_KEY set" in console
- Add your Mistral key to `.env`
- Restart the dev server (`npm run dev`) after changing `.env`

### "Groq API error (429)"
- You hit the rate limit (30 requests/min on free tier)
- Wait 60 seconds and try again

### Upload works but documents don't appear in the list
- The `documents` table might not exist — run the migration
- Check browser console for specific Supabase errors

---

## File Size & Format Limits

- Max file size: 50MB
- Supported: PDF, DOCX, TXT
- Chunking: ~1000 characters per chunk, 200-char overlap
- Embedding: Each chunk gets a 1024-dim vector via Mistral

---

## Phase 2 (Planned)

- Move API keys to Supabase Edge Functions (server-side)
- Add rate limiting per user
- Chat history persistence across sessions
- Volunteer onboarding AI workflow
- Receipt OCR

---

*Last updated: July 16, 2026*
