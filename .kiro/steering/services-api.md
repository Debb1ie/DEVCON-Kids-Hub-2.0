---
inclusion: fileMatch
fileMatchPattern: "src/services/**"
---
# Services API Contracts

## chatService.js
```
export callChatWithContext(userMessage, context=[], chatHistory=[], options={})
→ { response: string, citations: [], sources: [], apiUsed: string, model: string, metrics: {inputTokens, outputTokens} }

export callGeminiWithContext = callChatWithContext  // alias, keep it

export generateSessionSummary(messages) → string
```
- Call Edge Function `ai-chat`, not external APIs directly
- Load settings from Supabase before each call (temperature, personality, maxContextChunks)
- Keep: caching (5min TTL), retries (3x), fallback responses, streaming via options.onDelta

## ragService.js
```
export generateEmbedding(text) → number[768] | []
export storeDocumentChunks(documentId, title, chunks) → number
export semanticSearch(query, limit=5) → [{content, similarity, metadata}]
export retrieveContext(userQuery) → [{content, metadata, similarity}]
export deleteDocument(documentId) → boolean
export listDocuments() → array
```
- Call Edge Function `ai-embed` for embeddings
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
- Use pdfjs-dist for PDF, mammoth for DOCX
- Max 50MB file size, allowed: .pdf .docx .txt
