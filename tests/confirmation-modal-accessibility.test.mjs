import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const modal = read('src/components/ConfirmationModal.jsx');
const modalCss = read('src/components/ConfirmationModal.css');
const events = read('src/pages/Events.jsx');

test('confirmation modal is a named, described, portalled alert dialog', () => {
  assert.match(modal, /createPortal/);
  assert.match(modal, /role = 'alertdialog'/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /aria-labelledby=\{titleId\}/);
  assert.match(modal, /aria-describedby=\{messageId\}/);
});

test('safe action receives initial focus and every dialog action is non-submit', () => {
  assert.match(modal, /requestAnimationFrame\(\(\) => cancelRef\.current\?\.focus\(\)\)/);
  assert.equal((modal.match(/type="button"/g) || []).length, 2);
  assert.match(events, /cancelLabel="Stay"/);
});

test('Tab and Shift Tab wrap inside the dialog', () => {
  assert.match(modal, /event\.key !== 'Tab'/);
  assert.match(modal, /event\.shiftKey && document\.activeElement === first/);
  assert.match(modal, /!event\.shiftKey && document\.activeElement === last/);
  assert.match(modal, /last\.focus\(\)/);
  assert.match(modal, /first\.focus\(\)/);
});

test('Escape behaves as Stay and restoration uses the exact opening trigger', () => {
  assert.match(modal, /event\.key === 'Escape'/);
  assert.match(modal, /cancelHandlerRef\.current\(\)/);
  assert.match(modal, /const trigger = document\.activeElement instanceof HTMLElement/);
  assert.match(modal, /: trigger;/);
});

test('background is inert and scroll locked only while the modal is mounted', () => {
  assert.match(modal, /root\.inert = true/);
  assert.match(modal, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(modal, /root\.inert = previousRootInert/);
  assert.match(modal, /document\.body\.style\.overflow = previousBodyOverflow/);
  assert.match(modalCss, /confirmation-modal-overlay \{[\s\S]*?inset: 0;/);
  assert.match(modalCss, /confirmation-modal-container \{[\s\S]*?inset: 0;/);
});

test('Stay preserves event values and Discard delegates only to local reset paths', () => {
  assert.match(events, /onCancel=\{\(\) => setPendingDiscard\(null\)\}/);
  assert.match(events, /if \(pendingDiscard === 'event'\) finishCloseForm\(\)/);
  assert.match(events, /if \(pendingDiscard === 'report'\) finishCloseReportForm\(\)/);
  const discard = events.slice(events.indexOf('const confirmDiscard'), events.indexOf('const updateReportField'));
  assert.doesNotMatch(discard, /addEvent|updateEvent|uploadEventImage|rpc|submit/i);
});

test('Discard restores focus to a logical page control', () => {
  assert.match(events, /focusAfterConfirm=\{pendingDiscard === 'event' \? '#create-event-button' : '#open-legacy-report-button'\}/);
  assert.match(events, /id="create-event-button"/);
  assert.match(events, /id="open-legacy-report-button"/);
});

test('validated coordinator and submission focus pipelines are untouched', () => {
  assert.match(events, /scheduleValidationFocus/);
  assert.match(events, /id="event-coordinator"/);
  assert.match(events, /isIntentionalEventSubmit/);
  assert.match(events, /EVENT_CREATE_SUBMIT/);
});
