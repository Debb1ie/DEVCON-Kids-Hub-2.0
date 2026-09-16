import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const events = read('src/pages/Events.jsx');
const eventCss = read('src/pages/Events.css');
const sidebar = read('src/components/Sidebar.jsx');
const layout = read('src/components/Layout.jsx');
const topbar = read('src/components/Topbar.jsx');
const topbarCss = read('src/components/Topbar.css');
const sidebarCss = read('src/components/Sidebar.css');
const globalCss = read('src/index.css');
const tokens = read('src/styles/tokens.css');
const eventService = read('src/services/eventService.js');

test('role-filtered navigation keeps permissions centralized and labels dashboard as Overview', () => {
  assert.match(sidebar, /canAccessRoute\(roleKey, link\.path\)/);
  assert.match(sidebar, /name: 'Overview', path: '\/dashboard'/);
  assert.doesNotMatch(sidebar, /name: 'Dashboard'/);
});

test('mobile navigation implements Escape, focus containment and restoration', () => {
  assert.match(layout, /event\.key === 'Escape'/);
  assert.match(layout, /event\.key !== 'Tab'/);
  assert.match(layout, /menuButtonRef\.current\?\.focus/);
  assert.match(layout, /Skip to main content/);
});

test('skip link focuses the single main landmark without adding it to the tab order', () => {
  assert.equal((layout.match(/<main\b/g) || []).length, 1);
  assert.equal((layout.match(/id="main-content"/g) || []).length, 1);
  assert.match(layout, /href="#main-content" onClick=\{focusMainContent\}/);
  assert.match(layout, /mainContentRef\.current/);
  assert.match(layout, /mainContent\.focus\(\{ preventScroll: true \}\)/);
  assert.match(layout, /<main[^>]*tabIndex="-1"/);
});

test('unverified notification fixtures and global new-workshop action are removed', () => {
  assert.doesNotMatch(topbar, /INITIAL_NOTIFICATIONS|New Workshop|className="badge"/);
  assert.match(topbar, /account-menu/);
});

test('event editor is a full-page three-stage workflow that preserves form state', () => {
  assert.match(events, /Event details/);
  assert.match(events, /Assignment and media/);
  assert.match(events, /Review and save/);
  assert.match(events, /setEditorStep\(nextStep\)/);
  assert.doesNotMatch(events.slice(events.indexOf('event-editor'), events.indexOf('Post-Event Report collection modal')), /event-modal-container/);
  assert.match(events, /event-review-sections/);
  assert.match(events, /selectedCoordinatorOption\.full_name/);
});

test('chapter changes clear coordinator identity before requesting fresh options', () => {
  assert.match(events, /coordinator_user_id: '', coordinator: ''/);
  assert.match(events, /setEligibleCoordinators\(\[\]\)/);
  assert.match(events, /void loadCoordinators\(e\.target\.value\)/);
});

test('stale coordinator responses remain rejected', () => {
  assert.match(events, /coordinatorRequestRef\.current !== requestId/);
  assert.match(events, /setCoordinatorChapterId\(chapterId\)/);
});

test('failed saves preserve input and focus an error summary', () => {
  assert.match(events, /setValidationErrors/);
  assert.doesNotMatch(events.match(/catch \(error\) \{[\s\S]*?\n    \}/)?.[0] || '', /setForm\(createEmptyForm/);
  assert.match(read('src/components/ErrorSummary.jsx'), /ref\.current\?\.focus/);
});

test('field validation exposes inline errors and summary links focus fields', () => {
  const errorSummary = read('src/components/ErrorSummary.jsx');
  for (const field of ['event-name', 'event-chapter', 'event-date', 'event-status', 'event-coordinator', 'event-image-file', 'event-image-url']) {
    assert.match(events, new RegExp(`${field}-error`));
    assert.match(events, new RegExp(`validationErrorFor\\('${field}'\\)`));
  }
  assert.match(events, /aria-invalid=\{validationErrorFor\('event-name'\) \? true : undefined\}/);
  assert.match(events, /describedBy\('coordinator-state', validationErrorFor\('event-coordinator'\) && 'event-coordinator-error'\)/);
  assert.match(events, /describedBy\('event-image-help', validationErrorFor\('event-image-url'\) && 'event-image-url-error'\)/);
  assert.match(events, /clearValidationError\('event-name', Boolean\(e\.target\.value\.trim\(\)\)\)/);
  assert.match(events, /clearValidationError\('event-coordinator', Boolean\(selected\)\)/);
  assert.match(events, /clearValidationError\('event-date', isValidIsoDate\(e\.target\.value\)\)/);
  assert.match(events, /scheduleValidationFocus/);
  assert.match(events, /setPendingValidationFocus\(createValidationFocusRequest\(error, requestId\)\)/);
  assert.match(events, /setEditorStep\(error\.stage\)/);
  assert.match(events, /<ErrorSummary errors=\{validationErrors\} onActivate=\{activateValidationError\}/);
  assert.match(errorSummary, /errors\.filter\(\(error\) => error\.fieldId\)/);
});

test('one consistent hamburger controls navigation with a 44 by 44 hit area', () => {
  const toggleRule = topbarCss.match(/\.menu-toggle,\s*\n\.topbar-icon-btn \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(toggleRule, /width: 44px/);
  assert.match(toggleRule, /height: 44px/);
  assert.match(topbar, /<Menu size=\{24\}/);
  assert.match(topbar, /aria-expanded=\{navigationExpanded\}/);
  assert.match(topbar, /aria-controls="primary-navigation"/);
  assert.doesNotMatch(sidebar, /PanelLeftClose|PanelLeftOpen|sidebar-toggle/);
});

test('official square lockup keeps its intrinsic ratio inside a bounded brand area', () => {
  assert.match(sidebarCss, /\.brand-logo-surface img[^\n]*width: auto[^\n]*height: auto[^\n]*object-fit: contain/);
  assert.doesNotMatch(sidebarCss, /\.brand-logo-surface img[^\n]*(object-fit: cover|transform: scale)/);
});

test('desktop density uses readable type, practical controls, and a bounded editor rail', () => {
  assert.match(globalCss, /body \{[\s\S]*?font-size: 1rem/);
  assert.match(globalCss, /\.page-header h1[^\n]*1\.75rem/);
  assert.match(topbarCss, /\.topbar \{[\s\S]*?min-height: 4rem/);
  assert.match(sidebarCss, /\.nav-item \{[^\n]*min-height: 2\.875rem/);
  assert.match(eventCss, /\.event-editor \{[^\n]*72rem/);
  assert.match(eventCss, /\.event-review-section h3[^\n]*1\.25rem/);
  assert.match(eventCss, /\.event-editor-actions button[^\n]*min-height: 3rem/);
});

test('unsaved changes are protected during close and browser navigation', () => {
  assert.match(events, /setPendingDiscard\('event'\)/);
  assert.match(events, /beforeunload/);
});

test('event images validate supported types and 10 MB before private upload', () => {
  assert.match(eventService, /image\/jpeg.*image\/png.*image\/webp/);
  assert.match(eventService, /10 \* 1024 \* 1024/);
  assert.match(events, /Staged locally/);
  assert.match(events, /role="progressbar"/);
  assert.match(eventCss, /aspect-ratio: 16 \/ 9/);
});

test('event save does not call Google Workspace automation', () => {
  const submit = events.slice(events.indexOf('const handleSubmit'), events.indexOf('const handleDelete'));
  assert.doesNotMatch(submit, /google|workspace|folder job|sheet/i);
  assert.match(submit, /addEvent|updateEvent/);
  assert.match(eventService, /save_event_with_coordinator/);
});

test('responsive and reduced-motion rules cover compact mobile widths', () => {
  assert.match(eventCss, /max-width: 374px/);
  assert.match(eventCss, /max-width: 767px/);
  assert.match(eventCss, /prefers-reduced-motion: reduce/);
  assert.match(eventCss, /min-height: 3rem/);
});

test('semantic tokens preserve locked brand values and both themes', () => {
  for (const value of ['#464646', '#ffffff', '#e8ca04', '#ea641d', '#7f08ff', '#71b406']) assert.ok(tokens.includes(value));
  assert.match(tokens, /body\.dark-mode/);
  assert.match(tokens, /--focus-ring/);
  assert.match(tokens, /--skeleton/);
});
