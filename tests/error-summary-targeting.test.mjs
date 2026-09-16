import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createValidationError,
  createValidationFocusRequest,
  scheduleValidationFocus,
} from '../src/utils/validationFocus.js';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const summarySource = source('src/components/ErrorSummary.jsx');
const eventsSource = source('src/pages/Events.jsx');

const errors = {
  name: createValidationError({ key: 'event-name-required', fieldId: 'event-name', stage: 0, message: 'Enter an event name.' }),
  chapter: createValidationError({ key: 'event-chapter-required', fieldId: 'event-chapter', stage: 0, message: 'Select a chapter.' }),
  coordinator: createValidationError({ key: 'event-coordinator-required', fieldId: 'event-coordinator', stage: 1, message: 'Select a coordinator.' }),
};

const interactionHarness = () => {
  const frames = [];
  const windowRef = {
    history: { state: null, url: '', replaceState(_state, _title, url) { this.url = url; } },
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
    cancelAnimationFrame() {},
  };
  const documentRef = { activeElement: null };
  const controls = new Map(Object.values(errors).map((error) => {
    const control = {
      id: error.fieldId,
      accessibleName: error.fieldId === 'event-coordinator' ? 'Event Coordinator' : error.fieldId,
      matches: () => true,
      scrollIntoView() {},
      focus() { documentRef.activeElement = this; },
    };
    return [error.fieldId, control];
  }));
  documentRef.getElementById = (id) => controls.get(id) || null;
  let stage = 0;
  let currentRequest = 0;
  let cancel = null;
  let submits = 0;
  const activate = (error, renderDelayFrames = 0) => {
    cancel?.();
    const request = createValidationFocusRequest(error, ++currentRequest);
    stage = request.stage;
    let remainingDelay = renderDelayFrames;
    const originalLookup = documentRef.getElementById;
    documentRef.getElementById = (id) => {
      if (id === request.fieldId && remainingDelay-- > 0) return null;
      return originalLookup(id);
    };
    cancel = scheduleValidationFocus({
      fieldId: request.fieldId,
      documentRef,
      windowRef,
      isCurrent: () => currentRequest === request.requestId,
    });
    return request;
  };
  const flushAll = () => { while (frames.length) frames.shift()(); };
  return { activate, flushAll, controls, documentRef, windowRef, get stage() { return stage; }, get submits() { return submits; } };
};

test('Coordinator-only activation focuses the native select with the correct identity', () => {
  const harness = interactionHarness();
  const request = harness.activate(errors.coordinator);
  harness.flushAll();
  assert.equal(request.errorKey, 'event-coordinator-required');
  assert.equal(harness.stage, 1);
  assert.equal(harness.documentRef.activeElement, harness.controls.get('event-coordinator'));
  assert.equal(harness.documentRef.activeElement.accessibleName, 'Event Coordinator');
  assert.equal(harness.windowRef.history.url, '#event-coordinator');
  assert.equal(harness.submits, 0);
});

test('multiple errors navigate independently in both directions', () => {
  const harness = interactionHarness();
  for (const error of [errors.name, errors.coordinator, errors.name, errors.coordinator]) {
    harness.activate(error);
    harness.flushAll();
    assert.equal(harness.documentRef.activeElement.id, error.fieldId);
    assert.equal(harness.stage, error.stage);
  }
  assert.equal(harness.submits, 0);
});

test('Coordinator with Event name and Chapter errors retains separate keys and targets', () => {
  const combined = [errors.name, errors.chapter, errors.coordinator];
  assert.equal(new Set(combined.map((error) => error.key)).size, 3);
  assert.deepEqual(combined.map((error) => error.fieldId), ['event-name', 'event-chapter', 'event-coordinator']);
});

test('delayed destination rendering focuses Coordinator after it becomes available', () => {
  const harness = interactionHarness();
  harness.activate(errors.coordinator, 2);
  harness.flushAll();
  assert.equal(harness.documentRef.activeElement, harness.controls.get('event-coordinator'));
});

test('repeated and rapid activations cancel stale requests', () => {
  const harness = interactionHarness();
  harness.activate(errors.coordinator, 2);
  harness.activate(errors.name);
  harness.activate(errors.coordinator);
  harness.flushAll();
  assert.equal(harness.documentRef.activeElement, harness.controls.get('event-coordinator'));
  assert.equal(harness.windowRef.history.url, '#event-coordinator');
});

test('rendering uses stable keys, exact objects, correct hrefs, and no generic links', () => {
  assert.match(summarySource, /key=\{error\.key\}/);
  assert.match(summarySource, /href=\{`#\$\{error\.fieldId\}`\}/);
  assert.match(summarySource, /focusField\(event, error\)/);
  assert.match(summarySource, /event\.preventDefault\(\)/);
  assert.doesNotMatch(summarySource, /errors\.find/);
});

test('Coordinator keeps native semantics and described-by references', () => {
  assert.match(eventsSource, /<select id="event-coordinator"/);
  assert.match(eventsSource, /aria-invalid=\{validationErrorFor\('event-coordinator'\) \? true : undefined\}/);
  assert.match(eventsSource, /describedBy\('coordinator-state', validationErrorFor\('event-coordinator'\) && 'event-coordinator-error'\)/);
  assert.doesNotMatch(eventsSource, /<select id="event-coordinator"[^>]*tabIndex/);
});

test('generic server failures remain unlinked', () => {
  assert.match(eventsSource, /setValidationErrors\(issue \? \[createValidationError/);
  assert.match(eventsSource, /: \[\]\)/);
});
