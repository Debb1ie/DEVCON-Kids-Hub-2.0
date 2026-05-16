# Google OAuth Setup Checklist

## Issue
When clicking "Sign in with Google", you get:
```
{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}
```

## Fix Checklist

### 1. Google Cloud Console Setup
- [ ] Go to **APIs & Services** → **OAuth consent screen**
  - [ ] Configure the consent screen (publish as External if needed)
- [ ] Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID** → **Web application**
  - [ ] Set **Authorized redirect URI** to:
    ```
    https://qjlgsfhkcynkqatdjdwo.supabase.co/auth/v1/callback
    ```
  - [ ] Copy the **Client ID** and **Client Secret**

### 2. Supabase Dashboard Setup
- [ ] Open your Supabase project → **Authentication** → **Settings** → **External OAuth Providers** (or **Providers**)
  - [ ] Enable **Google**
  - [ ] Paste your Google **Client ID**:
    ```
    615888800431-b7scnmgrq5le7g1jbluaic1it04722ru.apps.googleusercontent.com
    ```
  - [ ] Paste your Google **Client Secret** (from Google Cloud Console)
  - [ ] Click **Save**

### 3. Supabase Redirect URLs
- [ ] In Supabase → **Authentication** → **Settings** → **Redirect URLs**
  - [ ] Add your app URLs:
    ```
    http://localhost:5173/dashboard
    http://localhost:5173
    https://your-production-domain.com/dashboard
    ```
  - [ ] Click **Save**

## Testing
1. Start the dev server:
   ```bash
   npm run dev
   ```

2. Open http://localhost:5173 → Click "Sign in with Google" on Login page

3. Open browser console (F12) and look for:
   - `Initiating Google OAuth. Redirect URL: http://localhost:5173/dashboard`
   - If you see an error, check the Supabase OAuth provider status

4. You should be redirected to:
   - Google's OAuth consent screen
   - Back to Supabase (brief redirect)
   - Back to your app → `/dashboard`

## Debugging
- Check browser **Network** tab for redirect chain
- Check **Console** for auth session logs
- Verify in Supabase **Auth** → **Users** that your Google user was created after successful sign-in

## Common Issues

### "Unsupported provider: provider is not enabled"
- Ensure Google OAuth is **enabled** in Supabase (toggle is ON)
- Verify Client ID and Secret are correct

### Redirect back to login after Google callback
- Check **Redirect URLs** in Supabase match your app origin
- Ensure `onAuthStateChange` listener in AppState is working (check Console logs)

### Blank page after Google redirect
- Open Console and check for JavaScript errors
- Verify session was created: check Supabase **Auth** → **Users**

---

**App redirect URL**: `http://localhost:5173/dashboard` (or your production URL)

**Supabase callback URL (for Google Console)**: `https://qjlgsfhkcynkqatdjdwo.supabase.co/auth/v1/callback`
