---
inclusion: fileMatch
fileMatchPattern: "src/services/**"
---
# Services API Contracts

## chatService.js
```
export callChatWithContext(userMessage, context=[], chatHistory=[], options={})
→ { response: string, citations: [], sources: [], apiUsed: string, model: string, metrics: {inputTokens, outputTokens} }

export callGeminiWithContext = callChatWithContext  // alias, keep for backward compat

export generateSessionSummary(messages) → string
```
- Phase 1 (current): Calls Groq API directly (VITE_GROQ_API_KEY in frontend)
- Phase 2 (planned): Call Edge Function `ai-chat` instead
- Load settings from Supabase `ai_config` table before each call (temperature, personality, maxContextChunks)
- Keep: caching (5min TTL), retries (3x), fallback responses, streaming via options.onDelta/onFirstToken

## ragService.js
```
export generateEmbedding(text) → number[1024] | []
export storeDocumentChunks(documentId, title, chunks) → number
export semanticSearch(query, limit=5) → [{content, similarity, metadata}]
export retrieveContext(userQuery) → [{content, metadata, similarity}]
export deleteDocument(documentId) → boolean
export listDocuments() → array
```
- Phase 1 (current): Calls Mistral API directly (VITE_MISTRAL_API_KEY in frontend)
- Phase 2 (planned): Call Edge Function `ai-embed` for embeddings
- Embedding model: mistral-embed (1024 dimensions)
- Vector search via Supabase RPC `search_knowledge_base`
- Return `[]` on any failure (never throw)

## documentService.js
```
export processDocument(file) → {fileName, fileType, totalPages, chunks, totalChunks}
export validateDocumentFile(file) → true | throws Error
export parsePDF(file) → [{pageNumber, content}]
export parseDOCX(file) → [{pageNumber, content}]
export parseTXT(file) → [{pageNumber, content}]
export chunkText(text, chunkSize=1000, overlap=200) → [{id, content, size}]
```
- Use pdfjs-dist for PDF (worker in public/pdf.worker.min.mjs)
- Use mammoth for DOCX
- Max 50MB file size, allowed: .pdf .docx .txt
