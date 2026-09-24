# Project Rules

## Stack
React 19 + Vite 8 (JSX) | Supabase (Postgres, Auth, Edge Functions, pgvector) | Groq + Mistral | CSS (no Tailwind)

## AI Provider
- Chat: Groq API — Llama 3.3 70B Versatile (free tier: 30 req/min)
- Embeddings: Mistral AI — mistral-embed, 1024 dimensions (free tier: 1M tokens/mo)
- Phase 1 (current): Keys in frontend .env (VITE_GROQ_API_KEY, VITE_MISTRAL_API_KEY)
- Phase 2 (planned): Keys move to Supabase Edge Functions. NEVER use `VITE_` prefix for API keys in production.

## Code Rules
- Always add comments explaining WHY, not just WHAT. Every function gets a JSDoc header.
- Functional components, async/await, const by default, early returns.
- Wrap all fetch/Supabase calls in try/catch. Return safe fallbacks on failure.
- One CSS file per component. BEM-like class names. Support `.dark-mode`.
- Imports order: React → libraries → local components → services → CSS.

## Safety Rules (Team Project)
- Work on branch `kenneth/ai-automation`. Never push to main.
- NEVER delete/rename exported functions. Add optional params with defaults.
- Kenneth's scope: `src/services/`, `src/components/AIChat*`, `src/pages/KnowledgeBase*`, `src/pages/AISettings*`, `supabase/functions/**`, `supabase/migrations/**`, `AI_SETUP_GUIDE.md`, new files.
- Cautious edits: `AppState.jsx` (add only), `App.jsx` (add routes only), `package.json` (add deps only).
- Do NOT touch: Sidebar, Topbar, Layout, Login, Dashboard, Events, Chapters, Volunteers (except additive integration).
- New migrations: always `IF NOT EXISTS`, enable RLS, never edit existing migrations.
- Before commit: `npm run build` must pass.

## Response Shape (DO NOT BREAK)
`callChatWithContext` must return: `{ response, citations, sources, apiUsed, model, metrics }`
`retrieveContext` must return: `[{ content, metadata, similarity }]`
`generateEmbedding` must return: `number[]` (1024-dim) or `[]`
`processDocument` must return: `{ fileName, fileType, totalPages, chunks, totalChunks }`
