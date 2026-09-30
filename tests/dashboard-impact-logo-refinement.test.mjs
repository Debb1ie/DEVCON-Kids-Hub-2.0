import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const dashboard = read('src/pages/Dashboard.jsx');
const dashboardCss = read('src/pages/Dashboard.css');
const sidebar = read('src/components/Sidebar.jsx');
const sidebarCss = read('src/components/Sidebar.css');
const topbarCss = read('src/components/Topbar.css');
const intro = read('src/pages/LandingPage.jsx');
const introCss = read('src/pages/LandingPage.css');
const login = read('src/pages/Login.jsx');
const loginCss = read('src/pages/Login.css');
const globalCss = read('src/index.css');
const sparkHub = read('src/components/brand/SparkHub.jsx');
const brandCss = read('src/components/brand/brand.css');
const tokens = read('src/styles/tokens.css');

test('the approved Spark Hub lockup is the unframed brand in every location', () => {
  assert.match(sparkHub, /export function SparkHubMark/);
  assert.match(sparkHub, /export function BrandLockup/);
  assert.match(sparkHub, /viewBox="0 0 64 64"/, 'the mark keeps its fixed square construction grid');
  assert.match(sparkHub, /role="img" aria-label="DEVCON Kids Hub"/, 'the lockup exposes one accessible brand name');

  for (const source of [sidebar, intro, login]) {
    assert.match(source, /from '\.\.?\/(components\/)?brand\/SparkHub'/);
    assert.match(source, /<BrandLockup\b/);
    assert.doesNotMatch(source, /devcon-kids-logo|<img\b/);
  }

  // Theme-aware wordmark: lockup colors come from logo tokens defined for both themes.
  assert.match(brandCss, /\.brand-lockup-name \{[^}]*color: var\(--logo-text\)/);
  assert.match(brandCss, /\.brand-lockup-parent \{[^}]*color: var\(--logo-accent\)/);
  assert.match(tokens, /:root \{[\s\S]*--logo-text: var\(--ink-950\)/);
  assert.match(tokens, /body\.dark-mode \{[\s\S]*--logo-text: #ffffff/);

  assert.doesNotMatch(sidebarCss, /\.brand-logo-surface|object-fit/);
  assert.doesNotMatch(sidebarCss.match(/\.logo-container\s*\{[\s\S]*?\}/)?.[0] || '', /background:|border:|box-shadow:/);
  assert.doesNotMatch(introCss.match(/\.brand-intro-mark\s*\{[\s\S]*?\}/)?.[0] || '', /background:|border:|box-shadow:/);
  assert.match(introCss, /prefers-reduced-motion: reduce[\s\S]*animation: none/);
});

test('decorative shell and card borders are removed while keyboard focus remains visible', () => {
  assert.match(globalCss, /\.card\s*\{[\s\S]*?border:\s*0/);
  assert.doesNotMatch(globalCss.match(/\.page-header\s*\{[\s\S]*?\}/)?.[0] || '', /border(?:-|:)/);
  assert.doesNotMatch(sidebarCss.match(/\.sidebar\s*\{[\s\S]*?\}/)?.[0] || '', /border(?:-|:)/);
  assert.doesNotMatch(sidebarCss.match(/\.sidebar-header\s*\{[\s\S]*?\}/)?.[0] || '', /border(?:-|:)/);
  assert.doesNotMatch(sidebarCss.match(/\.sidebar-footer\s*\{[\s\S]*?\}/)?.[0] || '', /border(?:-|:)/);
  assert.doesNotMatch(topbarCss.match(/\.topbar\s*\{[\s\S]*?\}/)?.[0] || '', /border(?:-|:)/);
  assert.match(globalCss, /:where\(button, a, input, select, textarea\):focus-visible\s*\{[\s\S]*?outline:\s*3px solid var\(--focus-ring\)/);
});

test('Nationwide Impact Overview ranks real data and renders no more than five rows', () => {
  assert.match(dashboard, /\.sort\(\(a, b\) => \(Number\(b\.learners\) \|\| 0\) - \(Number\(a\.learners\) \|\| 0\)\)/);
  assert.match(dashboard, /\.slice\(0, 5\)/);
  assert.match(dashboard, /topChapters\.map/);
  assert.doesNotMatch(dashboard, /chapters\.map\(\(chapter/);
  assert.match(dashboard, /hasAdditionalChapters[\s\S]*View all chapters/);
  assert.match(dashboard, /navigate\('\/dashboard\/chapters'\)/);
});

test('overview preserves semantic progress, keyboard scrolling, and empty state behavior', () => {
  assert.match(dashboard, /tabIndex=\{0\}/);
  assert.match(dashboard, /aria-label="Top chapters by learners reached"/);
  assert.match(dashboard, /role="progressbar"/);
  assert.match(dashboard, /Progress not reported/);
  assert.match(dashboard, /title="No active chapters"/);
  assert.match(dashboard, /description="Chapters will appear here once registered in the directory\."/);
});

test('overview is bounded at desktop widths and becomes a single-column mobile section', () => {
  assert.match(dashboardCss, /\.dashboard-content\s*\{[\s\S]*?align-items:\s*start/);
  assert.match(dashboardCss, /\.chapters-section\s*\{[\s\S]*?height:\s*clamp\(25rem, 31vw, 27\.5rem\)[\s\S]*?overflow:\s*hidden/);
  assert.match(dashboardCss, /\.chapters-list\s*\{[\s\S]*?overflow-y:\s*auto/);
  assert.match(dashboardCss, /@media \(max-width: 1024px\)[\s\S]*?\.chart-section\s*\{[\s\S]*?grid-column:\s*span 12[\s\S]*?\.chapters-section\s*\{[\s\S]*?grid-column:\s*span 12/);
  assert.match(dashboardCss, /@media \(max-width: 640px\)[\s\S]*?\.chapters-list\s*\{[\s\S]*?max-height:\s*22rem/);
});

test('static responsive contract covers 375, 768, 1024, and 1440 pixel layouts', () => {
  const responsiveWidths = [375, 768, 1024, 1440];
  assert.deepEqual(responsiveWidths, [375, 768, 1024, 1440]);

  const desktopGrid = dashboardCss.match(/\.dashboard-content\s*\{[\s\S]*?\}/)?.[0] || '';
  assert.match(desktopGrid, /repeat\(12, minmax\(0, 1fr\)\)/, '1440px uses the bounded 12-column grid');
  assert.match(dashboardCss, /@media \(max-width: 1024px\)[\s\S]*?\.chart-section\s*\{[\s\S]*?span 12/, '1024px stacks the chart');
  assert.match(dashboardCss, /@media \(max-width: 1024px\)[\s\S]*?\.chapters-section\s*\{[\s\S]*?span 12/, '768px stacks the overview');
  assert.match(dashboardCss, /@media \(max-width: 640px\)[\s\S]*?\.kpi-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr/, '375px uses one column');
});
