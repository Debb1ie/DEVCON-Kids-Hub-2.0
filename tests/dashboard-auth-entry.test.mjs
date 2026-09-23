import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('src/App.jsx');
const dashboard = read('src/pages/Dashboard.jsx');
const dashboardCss = read('src/pages/Dashboard.css');
const intro = read('src/pages/LandingPage.jsx');
const introCss = read('src/pages/LandingPage.css');
const login = read('src/pages/Login.jsx');
const appState = read('src/context/AppState.jsx');

test('dashboard growth chart uses a bounded responsive height without grid stretching', () => {
  assert.match(dashboardCss, /\.dashboard-content\s*\{[\s\S]*?align-items:\s*start/);
  assert.match(dashboardCss, /\.chart-container\s*\{[\s\S]*?height:\s*clamp\(280px,\s*26vw,\s*340px\)/);
  assert.match(dashboardCss, /@media \(max-width: 640px\)[\s\S]*?height:\s*clamp\(240px,\s*72vw,\s*290px\)/);
  assert.match(dashboard, /<ResponsiveContainer width="100%" height="100%" initialDimension=\{\{ width: 1, height: 280 \}\}>/);
  assert.match(dashboard, /accessibilityLayer/);
  assert.match(dashboard, /aria-label="Impact growth trend showing learners reached by month"/);
});

test('dashboard presentation copy does not mention the retired campaign phrase', () => {
  assert.doesNotMatch(dashboard, /hour of ai/i);
  assert.match(dashboard, /Here's what's happening with DEVCON Kids across the nation\./);
});

test('unauthenticated root shows the short intro and transitions to login', () => {
  assert.match(app, /path="\/"[\s\S]*?<PublicOnlyRoute><LandingPage \/><\/PublicOnlyRoute>/);
  assert.match(intro, /navigate\('\/login', \{ replace: true \}\)/);
  assert.match(intro, /transitionDelay = reducedMotion \? 150 : 1100/);
  assert.match(intro, /DEVCON Kids is loading/);
});

test('authenticated root bypasses the intro and routes directly to dashboard', () => {
  assert.match(app, /return isAuthenticated \? <Navigate to=\{authenticatedDestination\} replace \/> : children/);
  assert.match(app, /authenticatedDestination = '\/dashboard'/);
});

test('intro and login use the official logo safely with reduced motion', () => {
  assert.match(intro, /assets\/devcon-kids-logo\.png/);
  assert.match(login, /assets\/devcon-kids-logo\.png/);
  assert.match(introCss, /object-fit:\s*contain/);
  assert.match(introCss, /prefers-reduced-motion:\s*reduce/);
  assert.match(introCss, /animation:\s*none/);
});

test('existing Google OAuth initiation path remains in use', () => {
  assert.match(login, /const \{ loginWithGoogle \} = useApp\(\)/);
  assert.match(login, /await loginWithGoogle\(\)/);
  assert.match(appState, /supabase\.auth\.signInWithOAuth\(\{[\s\S]*?provider: 'google'[\s\S]*?redirectTo: redirectUrl/);
});
