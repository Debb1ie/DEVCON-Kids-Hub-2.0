# Project Rules

## Stack
React 19 + Vite 8 (JSX) | Supabase (Postgres, Auth, Edge Functions, pgvector) | Google Gemini 2.0 Flash | CSS (no Tailwind)

## AI Provider
- Chat: Gemini 2.0 Flash (via Edge Function `ai-chat`)
- Embeddings: text-embedding-004, 768 dimensions (via Edge Function `ai-embed`)
- OCR: Gemini 2.0 Flash multimodal (via Edge Function `ocr-receipt`)
- All keys server-side only (Supabase secrets). NEVER use `VITE_` prefix for API keys.

## Code Rules
- Always add comments explaining WHY, not just WHAT. Every function gets a JSDoc header.
- Functional components, async/await, const by default, early returns.
- Wrap all fetch/Supabase calls in try/catch. Return safe fallbacks on failure.
- One CSS file per component. BEM-like class names. Support `.dark-mode`.
- Imports order: React → libraries → local components → services → CSS.

## Safety Rules (Team Project)
- Work on branch `feat/ai-*`. Never push to main.
- NEVER delete/rename exported functions. Add optional params with defaults.
- Kenneth's scope: `src/services/`, `src/components/AIChat*`, `src/pages/KnowledgeBase*`, `src/pages/AISettings*`, `supabase/functions/**`, `AI_SETUP_GUIDE.md`, new files.
- Cautious edits: `AppState.jsx` (add only), `App.jsx` (add routes only), `package.json` (add deps only).
- Do NOT touch: Sidebar, Topbar, Layout, Login, Dashboard, Events, Chapters, Volunteers (except additive integration).
- New migrations: always `IF NOT EXISTS`, enable RLS, never edit existing migrations.
- Before commit: `npm run lint` + `npm run build` must pass.

## Response Shape (DO NOT BREAK)
`callChatWithContext` must return: `{ response, citations, sources, apiUsed, model, metrics }`
`retrieveContext` must return: `[{ content, metadata, similarity }]`
`generateEmbedding` must return: `number[]` (768-dim) or `[]`
`processDocument` must return: `{ fileName, fileType, totalPages, chunks, totalChunks }`
