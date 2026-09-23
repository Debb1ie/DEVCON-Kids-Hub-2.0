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

test('light and dark semantic text tokens meet WCAG AA on their surfaces', () => {
  assert.ok(contrast('#28242f', '#f5f2f8') >= 4.5);
  assert.ok(contrast('#655e70', '#f5f2f8') >= 4.5);
  assert.ok(contrast('#28242f', '#ffffff') >= 4.5);
  assert.ok(contrast('#655e70', '#ffffff') >= 4.5);
  assert.ok(contrast('#f8f5fa', '#19151f') >= 4.5);
  assert.ok(contrast('#c9c1d1', '#19151f') >= 4.5);
  assert.ok(contrast('#f8f5fa', '#241f2b') >= 4.5);
  assert.ok(contrast('#c9c1d1', '#241f2b') >= 4.5);
});

test('theme definitions pair complete surfaces and text colors', () => {
  assert.match(tokens, /--surface-page: #f5f2f8/);
  assert.match(tokens, /--surface-default: #ffffff/);
  assert.match(tokens, /--text-primary: #28242f/);
  assert.match(tokens, /--text-secondary: #655e70/);
  assert.match(tokens, /body\.dark-mode \{[\s\S]*--surface-page: #19151f/);
  assert.match(tokens, /body\.dark-mode \{[\s\S]*--surface-default: #241f2b/);
  assert.match(tokens, /body\.dark-mode \{[\s\S]*--text-primary: #f8f5fa/);
  assert.match(tokens, /body\.dark-mode \{[\s\S]*--text-secondary: #c9c1d1/);
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
