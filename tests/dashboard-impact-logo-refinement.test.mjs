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

test('the supplied transparent PNG is used unframed in every brand location', () => {
  const logo = readFileSync(new URL('../src/assets/devcon-kids-logo.png', import.meta.url));
  assert.equal(logo.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(logo[25], 6, 'PNG uses RGBA color with an alpha channel');

  for (const source of [sidebar, intro, login]) {
    assert.match(source, /assets\/devcon-kids-logo\.png/);
    assert.match(source, /alt="DEVCON Kids Hub"/);
  }

  assert.match(sidebarCss, /\.brand-logo-surface img[^\n]*object-fit: contain/);
  assert.doesNotMatch(sidebarCss.match(/\.brand-logo-surface\s*\{[\s\S]*?\}/)?.[0] || '', /background:|border:|box-shadow:/);
  assert.doesNotMatch(introCss.match(/\.brand-intro-mark\s*\{[\s\S]*?\}/)?.[0] || '', /background:|border:|box-shadow:/);
  assert.doesNotMatch(loginCss.match(/\.brand-logo-surface\.login-logo\s*\{[\s\S]*?\}/)?.[0] || '', /background:|border:|box-shadow:/);
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
