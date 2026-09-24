---
inclusion: fileMatch
fileMatchPattern: "supabase/functions/**"
---
# Edge Functions (Deno)

## Key Differences from Node.js
- Imports: `import { serve } from "https://deno.land/std@0.168.0/http/server.ts"`
- Env: `Deno.env.get('KEY')` (not process.env)
- No package.json, no node_modules

## Template
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const body = await req.json()
    // ... logic
    return new Response(JSON.stringify({ data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
```

## Rules
- Always handle OPTIONS preflight first
- Always include corsHeaders in ALL responses (including errors)
- Always validate input before processing
- Use `Deno.env.get()` for secrets, never hardcode
- One function per concern (don't mix chat + embeddings)

## Deploy: `supabase functions deploy <name>`
## Secrets: `supabase secrets set KEY=value`
## Frontend call: `supabase.functions.invoke('name', { body: {...} })`
