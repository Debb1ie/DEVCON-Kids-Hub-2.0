import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  AUTH_CALLBACK_PATH,
  buildOAuthRedirectUrl,
  clearAuthSession,
  completeOAuthCallback,
  getPostAuthRoute,
  getProtectedRouteResult,
  withTimeout,
} from '../src/auth/authFlow.js';

const session = { user: { id: 'test-user' } };

test('callback route is publicly declared', async () => {
  const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(appSource, /path="\/auth\/callback"\s+element={<AuthCallback\s*\/>}/);
});

test('callback URL uses the current origin and fixed callback path', () => {
  assert.equal(buildOAuthRedirectUrl('https://preview.example'), `https://preview.example${AUTH_CALLBACK_PATH}`);
});

test('loading prevents premature protected-route redirect', () => {
  assert.equal(getProtectedRouteResult({ authLoading: true, isAuthenticated: false }), 'loading');
});

test('PKCE callback exchanges an authorization code once', async () => {
  let exchanges = 0;
  const auth = { exchangeCodeForSession: async () => { exchanges += 1; return { data: { session }, error: null }; } };
  assert.equal(await completeOAuthCallback(auth, 'https://preview.example/auth/callback?code=one-time-code'), session);
  assert.equal(exchanges, 1);
});

test('successful existing session initializes after refresh', async () => {
  const auth = { getSession: async () => ({ data: { session }, error: null }) };
  assert.equal(await completeOAuthCallback(auth, 'https://preview.example/auth/callback'), session);
});

test('authenticated user without role routes to Pending Approval', () => {
  assert.equal(getPostAuthRoute(null), '/pending-approval');
  assert.equal(getPostAuthRoute({ roleKey: 'pending_volunteer' }), '/pending-approval');
});

test('approved user routes to the dashboard', () => {
  assert.equal(getPostAuthRoute({ roleKey: 'volunteer' }), '/dashboard');
});

test('provider and missing-session callback failures are safe', async () => {
  const auth = { getSession: async () => ({ data: { session: null }, error: null }) };
  await assert.rejects(() => completeOAuthCallback(auth, 'https://preview.example/auth/callback?error=access_denied'), /not completed/);
  await assert.rejects(() => completeOAuthCallback(auth, 'https://preview.example/auth/callback'), /No Google sign-in session/);
});

test('callback processing has a deterministic timeout', async () => {
  await assert.rejects(() => withTimeout(new Promise(() => {}), 5), /too long/);
});

test('post-auth destinations cannot loop back to login or callback', () => {
  for (const profile of [null, { roleKey: 'pending_volunteer' }, { roleKey: 'admin' }]) {
    assert.notEqual(getPostAuthRoute(profile), '/login');
    assert.notEqual(getPostAuthRoute(profile), AUTH_CALLBACK_PATH);
  }
});

test('logout delegates to Supabase signOut', async () => {
  let called = false;
  await clearAuthSession({ signOut: async () => { called = true; return { error: null }; } });
  assert.equal(called, true);
});

test('unauthenticated and pending users are rejected safely', () => {
  assert.equal(getProtectedRouteResult({ authLoading: false, isAuthenticated: false }), '/login');
  assert.equal(getProtectedRouteResult({ authLoading: false, isAuthenticated: true, isPendingVolunteer: true }), '/pending-approval');
});

test('role route permits allowed roles and redirects disallowed roles', () => {
  assert.equal(getProtectedRouteResult({ authLoading: false, isAuthenticated: true, roleKey: 'admin' }, ['admin']), 'allow');
  assert.equal(getProtectedRouteResult({ authLoading: false, isAuthenticated: true, roleKey: 'volunteer' }, ['admin']), '/dashboard');
});
