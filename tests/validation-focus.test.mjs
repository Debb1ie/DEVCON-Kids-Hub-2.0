import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createValidationError, createValidationFocusRequest, resolveValidationControl, scheduleValidationFocus } from '../src/utils/validationFocus.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const createWindow = () => {
  const frames = [];
  return {
    frames,
    history: { state: null, replaceState(_state, _title, url) { this.url = url; } },
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
    cancelAnimationFrame() {},
    flush() { frames.shift()?.(); },
  };
};

const createControl = ({ matches = true, name = 'Event Coordinator' } = {}) => ({
  name,
  matches: () => matches,
  focus() { this.ownerDocument.activeElement = this; },
  scrollIntoView(options) { this.scrollOptions = options; },
  querySelector: () => null,
});

test('Coordinator summary focus resolves the native select, not its wrapper', () => {
  const documentRef = { activeElement: null };
  const select = createControl();
  select.ownerDocument = documentRef;
  documentRef.getElementById = () => select;
  assert.equal(resolveValidationControl('event-coordinator', documentRef), select);
  assert.equal(select.name, 'Event Coordinator');
});

test('a wrapper resolves its interactive control without becoming focusable', () => {
  const documentRef = { activeElement: null };
  const select = createControl();
  select.ownerDocument = documentRef;
  const wrapper = createControl({ matches: false, name: '' });
  wrapper.querySelector = () => select;
  documentRef.getElementById = () => wrapper;
  assert.equal(resolveValidationControl('event-coordinator', documentRef), select);
  assert.equal(documentRef.activeElement, null);
});

test('focus waits for a rendered stage, focuses the control, and completes', () => {
  const windowRef = createWindow();
  const documentRef = { activeElement: null, getElementById: () => null };
  const select = createControl();
  select.ownerDocument = documentRef;
  let completed = null;
  scheduleValidationFocus({ fieldId: 'event-coordinator', documentRef, windowRef, onComplete: (success) => { completed = success; } });
  windowRef.flush();
  assert.equal(completed, null);
  documentRef.getElementById = () => select;
  windowRef.flush();
  assert.equal(documentRef.activeElement, select);
  assert.equal(windowRef.history.url, '#event-coordinator');
  assert.deepEqual(select.scrollOptions, { block: 'center', behavior: 'auto' });
  assert.equal(completed, true);
});

test('pending focus is bounded and cancellable', () => {
  const windowRef = createWindow();
  const documentRef = { activeElement: null, getElementById: () => null };
  let completed = null;
  const cancel = scheduleValidationFocus({ fieldId: 'event-name', documentRef, windowRef, maxFrames: 2, onComplete: (success) => { completed = success; } });
  windowRef.flush();
  windowRef.flush();
  assert.equal(completed, false);
  cancel();
});

test('stable errors and focus requests preserve exact field identity', () => {
  const coordinator = createValidationError({
    key: 'event-coordinator-required',
    fieldId: 'event-coordinator',
    stage: 1,
    message: 'Select an active Event Coordinator assigned to this chapter.',
  });
  assert.deepEqual(createValidationFocusRequest(coordinator, 7), {
    requestId: 7,
    errorKey: 'event-coordinator-required',
    fieldId: 'event-coordinator',
    stage: 1,
  });
});

test('a stale request cannot override a newer field focus', () => {
  const windowRef = createWindow();
  const documentRef = { activeElement: null };
  const name = createControl({ name: 'Event name' });
  const coordinator = createControl();
  name.ownerDocument = documentRef;
  coordinator.ownerDocument = documentRef;
  let currentRequest = 1;
  documentRef.getElementById = (id) => id === 'event-name' ? name : coordinator;
  scheduleValidationFocus({
    fieldId: 'event-name', documentRef, windowRef,
    isCurrent: () => currentRequest === 1,
  });
  currentRequest = 2;
  scheduleValidationFocus({
    fieldId: 'event-coordinator', documentRef, windowRef,
    isCurrent: () => currentRequest === 2,
  });
  windowRef.flush();
  windowRef.flush();
  assert.equal(documentRef.activeElement, coordinator);
  assert.equal(windowRef.history.url, '#event-coordinator');
});

test('rapid alternating error activation always leaves the latest target focused', () => {
  const windowRef = createWindow();
  const documentRef = { activeElement: null };
  const controls = new Map(['event-name', 'event-chapter', 'event-coordinator'].map((id) => {
    const control = createControl({ name: id === 'event-coordinator' ? 'Event Coordinator' : id });
    control.ownerDocument = documentRef;
    return [id, control];
  }));
  documentRef.getElementById = (id) => controls.get(id) || null;
  let currentRequest = 0;
  const activate = (fieldId) => {
    const requestId = ++currentRequest;
    scheduleValidationFocus({ fieldId, documentRef, windowRef, isCurrent: () => currentRequest === requestId });
  };
  for (const fieldId of ['event-name', 'event-coordinator', 'event-name', 'event-coordinator']) activate(fieldId);
  while (windowRef.frames.length) windowRef.flush();
  assert.equal(documentRef.activeElement, controls.get('event-coordinator'));
  assert.equal(windowRef.history.url, '#event-coordinator');
});

test('Events supports current-stage and cross-stage focus without a fixed timeout', () => {
  const events = read('src/pages/Events.jsx');
  const summary = read('src/components/ErrorSummary.jsx');
  assert.match(events, /setPendingValidationFocus\(createValidationFocusRequest\(error, requestId\)\)/);
  assert.match(events, /pendingValidationFocus\.stage !== editorStep/);
  assert.match(events, /scheduleValidationFocus/);
  assert.match(events, /validationFocusRequestRef\.current === requestId/);
  assert.doesNotMatch(events, /window\.setTimeout\([\s\S]*?field\?\.focus/);
  assert.match(summary, /event\.preventDefault\(\)/);
  assert.match(summary, /errors\.filter\(\(error\) => error\.fieldId\)/);
  assert.match(summary, /key=\{error\.key\}/);
  assert.match(summary, /focusField\(event, error\)/);
});

test('Coordinator semantics and visible focus stay on the actual select', () => {
  const events = read('src/pages/Events.jsx');
  const css = read('src/pages/Events.css');
  assert.match(events, /<label htmlFor="event-coordinator">Event Coordinator/);
  assert.match(events, /<select id="event-coordinator"/);
  assert.match(events, /aria-invalid=\{validationErrorFor\('event-coordinator'\) \? true : undefined\}/);
  assert.match(events, /describedBy\('coordinator-state', validationErrorFor\('event-coordinator'\) && 'event-coordinator-error'\)/);
  assert.match(css, /\.event-form-grid \.border-input:focus-visible \{[\s\S]*?outline: 3px solid var\(--focus-ring\)/);
  assert.doesNotMatch(events, /<select id="event-coordinator"[^>]*tabIndex/);
});
