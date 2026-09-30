import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const tokens = read('src/styles/tokens.css');
const indexCss = read('src/index.css');
const dashboardCss = read('src/pages/Dashboard.css');

const hexToRgb = (hex) => {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
};

const luminance = (hex) => {
  const channels = hexToRgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
};

const contrast = (foreground, background) => {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
};

// Reads a token value from a theme block so the checks follow the real stylesheet.
const tokenIn = (block, name) => block.match(new RegExp(`--${name}: (#[0-9a-f]{6})`, 'i'))?.[1];
const lightBlock = tokens.slice(tokens.indexOf(':root {'), tokens.indexOf('body.dark-mode {'));
const darkBlock = tokens.slice(tokens.indexOf('body.dark-mode {'));

test('Daylight and Moonlight text tokens meet WCAG AA on their surfaces', () => {
  for (const block of [lightBlock, darkBlock]) {
    const surfaces = ['surface-page', 'surface-default', 'surface-subtle', 'surface-elevated'].map((name) => tokenIn(block, name));
    for (const surface of surfaces) {
      for (const text of ['text-primary', 'text-secondary', 'text-tertiary']) {
        assert.ok(contrast(tokenIn(block, text), surface) >= 4.5, `${text} on ${surface}`);
      }
    }
    // Placeholders stay readable inside inputs; field outlines meet the 3:1 non-text minimum.
    assert.ok(contrast(tokenIn(block, 'text-placeholder'), tokenIn(block, 'surface-input')) >= 4.5);
    assert.ok(contrast(tokenIn(block, 'border-strong'), tokenIn(block, 'surface-default')) >= 3);
    assert.ok(contrast(tokenIn(block, 'text-primary'), tokenIn(block, 'surface-input')) >= 4.5);
  }
  // Moonlight disabled text stays legible rather than disappearing.
  assert.ok(contrast(tokenIn(darkBlock, 'text-disabled'), tokenIn(darkBlock, 'disabled-control')) >= 4.5);
});

test('theme definitions pair complete surfaces and text colors', () => {
  assert.match(tokens, /--surface-page: #fbf8f4/);
  assert.match(tokens, /--surface-default: #ffffff/);
  assert.match(tokens, /--text-primary: #1c1726/);
  assert.match(tokens, /--text-secondary: #4e4759/);
  assert.match(tokens, /body\.dark-mode \{[\s\S]*--surface-page: #0e0d1a/);
  assert.match(tokens, /body\.dark-mode \{[\s\S]*--surface-default: #1b1832/);
  assert.match(tokens, /body\.dark-mode \{[\s\S]*--text-primary: #f4f2fb/);
  assert.match(tokens, /body\.dark-mode \{[\s\S]*--text-secondary: #cfc9e2/);
  assert.match(tokens, /body\.dark-mode \{[\s\S]*--bg-main: var\(--surface-page\)/);
  assert.match(tokens, /body\.dark-mode \{[\s\S]*--bg-card: var\(--surface-default\)/);
  assert.match(tokens, /body\.dark-mode \{[\s\S]*--text-main: var\(--text-primary\)/);
  assert.match(tokens, /body\.dark-mode \{[\s\S]*--text-muted: var\(--text-secondary\)/);
});

test('Dashboard text and KPI content use semantic tokens', () => {
  for (const selector of ['.kpi-info h3', '.kpi-info p', '.section-header h2', '.chapter-title h4', '.chapter-completion', '.stat-val', '.stat-label']) {
    assert.ok(dashboardCss.includes(selector));
  }
  assert.doesNotMatch(dashboardCss, /color:\s*(?:white|#fff(?:fff)?)/i);
  assert.match(dashboardCss, /\.kpi-info h3[\s\S]*?color: var\(--text-primary\)/);
  assert.match(dashboardCss, /\.kpi-info p[\s\S]*?color: var\(--text-secondary\)/);
});

test('primary and secondary actions use the restrained semantic action hierarchy', () => {
  assert.match(indexCss, /\.btn-primary \{[\s\S]*?background: var\(--action-primary\)[\s\S]*?color: var\(--text-on-accent\)/);
  assert.match(indexCss, /\.btn-secondary \{[\s\S]*?background: var\(--bg-card\)[\s\S]*?color: var\(--primary-purple\)/);
  assert.doesNotMatch(indexCss, /\.btn-primary \{[\s\S]*?background: var\(--accent-green\)/);
});
