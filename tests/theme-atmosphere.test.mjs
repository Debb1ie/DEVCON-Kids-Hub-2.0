import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const atmosphere = read('src/components/brand/HeaderAtmosphere.jsx');
const atmosphereCss = read('src/components/brand/atmosphere.css');
const celestialCss = read('src/components/brand/celestial.css');
const layout = read('src/components/Layout.jsx');
const callback = read('src/pages/AuthCallback.jsx');

test('header atmosphere is decorative, confined to the upper area and behind content', () => {
  assert.match(atmosphere, /aria-hidden="true"/);
  assert.match(atmosphereCss, /\.header-atmosphere \{[\s\S]*?z-index: -1;[\s\S]*?height: 320px;[\s\S]*?pointer-events: none;/);
  assert.match(atmosphereCss, /mask-image: linear-gradient\(to bottom, #000 45%, transparent\)/);
  assert.match(atmosphereCss, /@media \(max-width: 640px\)[\s\S]*?height: 140px/);
  assert.match(atmosphereCss, /prefers-reduced-motion: reduce[\s\S]*animation: none !important/);
  assert.match(celestialCss, /prefers-reduced-motion: reduce[\s\S]*animation: none !important/);
});

test('the shell uses the header atmosphere and the old full-page particle canvas is not mounted', () => {
  assert.match(layout, /<HeaderAtmosphere quiet=\{quietAtmosphere\} \/>/);
  assert.doesNotMatch(layout, /CosmicBackground/);
});

test('auth callback stages follow the real flow and never wait on timers', () => {
  assert.doesNotMatch(callback, /setTimeout|setInterval/);
  assert.match(callback, /completeOAuthCallback\(supabase\.auth, window\.location\.href\)[\s\S]*setStage\(1\)[\s\S]*await acceptSession\(session\)[\s\S]*setStage\(2\)[\s\S]*navigate\(getPostAuthRoute\(profile\), \{ replace: true \}\)/);
  assert.match(callback, /aria-live="polite"/);
});
