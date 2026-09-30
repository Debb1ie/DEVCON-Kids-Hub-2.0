import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync('src/pages/PostEventReportReviewDetail.jsx', 'utf8');
const modal = readFileSync('src/components/ConfirmationModal.jsx', 'utf8');
const modalStyles = readFileSync('src/components/ConfirmationModal.css', 'utf8');

test('review workflow uses an in-app dialog instead of browser prompts', () => {
  assert.doesNotMatch(page, /window\.(?:prompt|confirm)\s*\(/);
  assert.match(page, /title=\{action === 'revision' \? 'Request Report Revision' : 'Approve Post Event Report'\}/);
  assert.match(page, /confirmLabel=\{action === 'revision' \? 'Request revision' : 'Approve report'\}/);
  assert.match(page, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /event\.key !== 'Tab'/);
  assert.match(modal, /event\.key === 'Escape'/);
});

test('cancel only closes the dialog and does not call the repository', () => {
  assert.match(page, /onCancel=\{\(\) => \{ if \(!busy\) \{ setAction\(null\); setNote\(''\); setActionError\(''\); \} \}\}/);
});

test('approval keeps the existing service call and has double-submit protection', () => {
  assert.match(page, /if \(!action \|\| requestPending\.current\) return/);
  assert.match(page, /requestPending\.current = true/);
  assert.match(page, /postEventReportRepository\.approve\(reportId, trimmed \|\| null\)/);
  assert.match(page, /requestPending\.current = false/);
  assert.match(page, /isBusy=\{busy\}/);
});

test('approval dialog renders Cancel and Approve report actions in a visible shared footer', () => {
  assert.match(page, /cancelLabel="Cancel"/);
  assert.match(page, /confirmLabel=\{action === 'revision' \? 'Request revision' : 'Approve report'\}/);
  assert.match(modal, /\{cancelLabel\}<\/button>/);
  assert.match(modal, /\{isBusy \? busyLabel : confirmLabel\}<\/button>/);
  assert.match(modal, /onClick=\{handleConfirm\} disabled=\{isBusy\}/);
  assert.match(modal, /className="btn-primary confirmation-modal-confirm"/);
  assert.match(modalStyles, /max-height:\s*calc\(100dvh - 2rem\)/);
  assert.doesNotMatch(modalStyles, /var\(--primary(?:\)|,)/);
});

test('failed approval preserves Submitted state while successful approval uses the returned status', () => {
  assert.match(page, /const updated = action === 'revision'[\s\S]*report: \{ \.\.\.current\.report, \.\.\.updated \}/);
  assert.match(page, /if \(updated\.status === 'approved'\) \{[\s\S]*reportAutomationService\.loadAndRecover\(reportId\)/);
  assert.match(page, /Report approved, but export could not be started automatically/);
  assert.match(page, /role="status"/);
});

test('revision dialog requires a reason and uses the existing revision service', () => {
  assert.match(page, /action === 'revision' && !trimmed/);
  assert.match(page, /A revision reason is required/);
  assert.match(page, /postEventReportRepository\.requestRevision\(reportId, trimmed\)/);
  assert.match(page, /Revision reason \*/);
  assert.match(page, /busyLabel="Working…"/);
});
