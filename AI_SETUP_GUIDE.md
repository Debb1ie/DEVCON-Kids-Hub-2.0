# AI Features Setup Guide

## Quick Setup Steps

### 1. Get a Google Gemini API Key
- Go to https://aistudio.google.com/app/apikey
- Click "Create API Key"
- Copy the key and add it to `.env`:
```
VITE_GEMINI_API_KEY=your_key_here
```

### 2. Setup Supabase Vector Database
Run the SQL migration to create knowledge base tables:

**Option A: Via Supabase Dashboard**
1. Open your Supabase project
2. Go to SQL Editor
3. Create new query and paste the entire content from:
   ```
   supabase/migrations/20260516_ai_knowledge_base.sql
   ```
4. Run the query

**Option B: Via Supabase CLI**
```bash
supabase db push
```

### 3. Install Additional Dependencies
Some document parsing libraries may need manual installation:
```bash
npm install pdfjs-dist
```

### 4. Install Missing Packages
```bash
npm install
```

## AI Features Architecture

### Components
- **AIChat.jsx** - Floating widget + fullscreen chat interface
- **geminiService.js** - Gemini API client with RAG
- **ragService.js** - Vector search & embeddings
- **documentService.js** - PDF/DOCX/TXT parsing

### Pages
- **KnowledgeBase.jsx** - Admin panel for uploading documents
- **AISettings.jsx** - AI configuration & feature toggles

### Services Flow
1. **User asks question** → AIChat component
2. **System retrieves context** → ragService (semantic search)
3. **Gemini generates answer** → geminiService (with RAG context)
4. **Response displayed** → AIChat with citations

## Using the AI Features

### For End Users
1. Click the floating chat bubble (bottom-right corner)
2. Ask a question or choose a suggested prompt
3. AI responds with grounded answers from knowledge base
4. View source documents cited in the response

### For Admins
1. **Knowledge Base** - Upload PDF/DOCX/TXT documents
   - Documents are automatically chunked and indexed
   - Embeddings are optional and only generated if your local server supports them
   - Searchable via semantic similarity

2. **AI Settings** - Configure:
   - AI name and personality
   - Feature toggles (onboarding, event planning, FAQ)
   - Advanced parameters (temperature, rate limits)

## Important Notes

### Environment Variables
- `VITE_OPENAI_BASE_URL` - Local OpenAI-compatible chatbot endpoint
- `VITE_OPENAI_API_KEY` - API key for the local chatbot endpoint
- `VITE_OPENAI_MODEL` - Optional model name for the local chatbot endpoint
- `VITE_OPENAI_EMBEDDING_MODEL` - Optional embedding model for knowledge base search
- `VITE_SUPABASE_URL` - Already configured
- `VITE_SUPABASE_ANON_KEY` - Already configured

### Database Requirements
- Supabase project with pgvector extension enabled
- Vector embedding dimension depends on your embedding model

### File Upload Limits
- Max file size: 50MB
- Supported formats: PDF, DOCX, TXT
- Automatic chunking: ~1000 chars per chunk with 200-char overlap

### Rate Limiting
- Configured per user per hour (default: 100 requests)
- Prevents abuse and API quota overuse

## Troubleshooting

### "Vector search returns no results"
- Upload documents to knowledge base first
- If embeddings are disabled on the local server, retrieval will stay empty but chat still works
- Try broader search queries

### "Failed to parse PDF"
- Ensure file is a valid, non-corrupted PDF
- Check file size < 50MB

### "Vector search returns no results"
- Upload documents to knowledge base first
- Wait for embeddings to be generated (takes a few seconds)
- Try broader search queries

### Local chatbot API errors
- Check your local API key is valid
- Verify the server is reachable at `http://192.168.1.14/v1`
- Confirm the selected model is available on the local server

## Production Deployment

1. **Set environment variables** in production deployment:
   ```
   VITE_OPENAI_BASE_URL=https://your-server.example/v1
   VITE_OPENAI_API_KEY=your_production_key
   VITE_OPENAI_MODEL=your_model_name
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_key
   ```

2. **Enable Row-Level Security** (RLS) in Supabase
   - All tables have RLS enabled in migration
   - Adjust policies based on your permission model

3. **Rate Limiting**
   - Implement server-side rate limiting
   - Use Supabase Auth for user identification

4. **Monitoring**
   - Track API usage in Google AI Studio
   - Monitor vector search performance
   - Store chat analytics in `ai_chat_sessions` table

## API Costs

- **Google Gemini API**: Free tier available (high limits)
- **Vector Embeddings**: Minimal cost per embedding
- **Supabase**: Free pgvector support on any plan
- **Local LLM**: Cost depends on your own hardware and serving setup

## Next Steps

1. ✓ Configure Gemini API key
2. ✓ Run Supabase migrations
3. ✓ Upload sample documents to Knowledge Base
4. ✓ Test chat widget with "how do I..." questions
5. ✓ Customize AI personality in AI Settings
6. ✓ Deploy to production with environment variables

---

**Support**: For issues with Gemini API, visit https://ai.google.dev/
**Support**: For Supabase issues, visit https://supabase.com/docs
