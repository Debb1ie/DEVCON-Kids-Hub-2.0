import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  advanceEventEditor,
  EVENT_CREATE_SUBMIT,
  isIntentionalEventSubmit,
  shouldPreventImplicitEventSubmit,
} from '../src/utils/eventEditorSubmission.js';

const eventsSource = readFileSync('src/pages/Events.jsx', 'utf8');

const submitter = (overrides = {}) => ({
  ...EVENT_CREATE_SUBMIT,
  type: 'submit',
  ...overrides,
});

const createInteractionModel = ({ editorStep = 1 } = {}) => {
  const counts = { continue: 0, stageChanges: 0, formSubmit: 0, handled: 0, added: 0, rpc: 0 };
  let step = editorStep;
  let submitting = false;
  let navigationNode = { key: `event-editor-continue-${step}`, type: 'button' };

  const activateContinue = () => {
    counts.continue += 1;
    advanceEventEditor({ preventDefault() {} }, step + 1, (nextStep) => {
      counts.stageChanges += 1;
      step = nextStep;
      navigationNode = { key: EVENT_CREATE_SUBMIT.id, type: 'submit' };
    });
  };
  const submit = (candidate = submitter()) => {
    counts.formSubmit += 1;
    if (submitting || !isIntentionalEventSubmit({ editorStep: step, submitter: candidate })) return;
    submitting = true;
    counts.handled += 1;
    counts.added += 1;
    counts.rpc += 1;
  };

  return {
    counts,
    activateContinue,
    submit,
    setSubmitting(value) { submitting = value; },
    get step() { return step; },
    get navigationNode() { return navigationNode; },
  };
};

test('Continue prevents its native default before advancing exactly once', () => {
  const counts = { prevented: 0, moved: 0, submitted: 0, handled: 0, added: 0, rpc: 0 };
  const activation = { preventDefault: () => { counts.prevented += 1; } };
  advanceEventEditor(activation, 2, (nextStage) => {
    counts.moved += 1;
    assert.equal(nextStage, 2);
  });
  assert.deepEqual(counts, { prevented: 1, moved: 1, submitted: 0, handled: 0, added: 0, rpc: 0 });
});

test('Stage 2 pointer activation advances once without reusing or submitting the control', () => {
  const model = createInteractionModel();
  const stageTwoNode = model.navigationNode;
  model.activateContinue({ pointerType: 'mouse' });
  assert.equal(model.step, 2);
  assert.notEqual(model.navigationNode, stageTwoNode);
  assert.deepEqual(model.counts, { continue: 1, stageChanges: 1, formSubmit: 0, handled: 0, added: 0, rpc: 0 });
});

test('touch-like Stage 2 pointer activation advances without submission', () => {
  const model = createInteractionModel();
  model.activateContinue({ pointerType: 'touch' });
  assert.deepEqual(model.counts, { continue: 1, stageChanges: 1, formSubmit: 0, handled: 0, added: 0, rpc: 0 });
});

test('keyboard Continue then intentional Stage 3 submit each happen exactly once', () => {
  const model = createInteractionModel();
  model.activateContinue({ key: 'Enter' });
  assert.deepEqual(model.counts, { continue: 1, stageChanges: 1, formSubmit: 0, handled: 0, added: 0, rpc: 0 });
  model.submit();
  assert.deepEqual(model.counts, { continue: 1, stageChanges: 1, formSubmit: 1, handled: 1, added: 1, rpc: 1 });
});

test('Stage 1 Continue advances without submission', () => {
  const model = createInteractionModel({ editorStep: 0 });
  model.activateContinue();
  assert.equal(model.step, 1);
  assert.equal(model.counts.formSubmit, 0);
  assert.equal(model.counts.handled, 0);
});

test('navigation and final submit controls have distinct stable React identities', () => {
  assert.match(eventsSource, /key=\{`event-editor-continue-\$\{editorStep\}`\}/);
  assert.match(eventsSource, /key="event-editor-create-submit"/);
  assert.match(eventsSource, /onClick=\{handleContinue\}/);
  assert.match(eventsSource, /type="button" className="btn-primary"/);
  assert.match(eventsSource, /id=\{EVENT_CREATE_SUBMIT\.id\}[\s\S]*type="submit"/);
});

test('only the marked Stage 3 submitter is authorized', () => {
  assert.equal(isIntentionalEventSubmit({ editorStep: 1, submitter: submitter() }), false);
  assert.equal(isIntentionalEventSubmit({ editorStep: 2, submitter: null }), false);
  assert.equal(isIntentionalEventSubmit({ editorStep: 2, submitter: submitter({ id: 'unexpected' }) }), false);
  assert.equal(isIntentionalEventSubmit({ editorStep: 2, submitter: submitter({ name: 'unexpected' }) }), false);
  assert.equal(isIntentionalEventSubmit({ editorStep: 2, submitter: submitter({ value: 'unexpected' }) }), false);
  assert.equal(isIntentionalEventSubmit({ editorStep: 2, submitter: submitter({ type: 'button' }) }), false);
  assert.equal(isIntentionalEventSubmit({ editorStep: 2, submitter: submitter() }), true);
});

test('double activation is rejected while a submission is already in flight', () => {
  const model = createInteractionModel({ editorStep: 2 });
  model.setSubmitting(true);
  model.submit();
  model.submit();
  assert.deepEqual(model.counts, { continue: 0, stageChanges: 0, formSubmit: 2, handled: 0, added: 0, rpc: 0 });
});

test('implicit Enter is blocked only for pre-review text inputs', () => {
  assert.equal(shouldPreventImplicitEventSubmit({ editorStep: 0, key: 'Enter', target: { tagName: 'INPUT', type: 'text' } }), true);
  assert.equal(shouldPreventImplicitEventSubmit({ editorStep: 1, key: 'Enter', target: { tagName: 'INPUT', type: 'url' } }), true);
  assert.equal(shouldPreventImplicitEventSubmit({ editorStep: 1, key: 'Enter', target: { tagName: 'SELECT' } }), false);
  assert.equal(shouldPreventImplicitEventSubmit({ editorStep: 1, key: 'Enter', target: { tagName: 'TEXTAREA' } }), false);
  assert.equal(shouldPreventImplicitEventSubmit({ editorStep: 2, key: 'Enter', target: { tagName: 'INPUT', type: 'text' } }), false);
  assert.equal(shouldPreventImplicitEventSubmit({ editorStep: 1, key: ' ', target: { tagName: 'INPUT', type: 'text' } }), false);
});

test('Coordinator select Enter and textarea Enter preserve native control behavior without authorizing submit', () => {
  assert.equal(shouldPreventImplicitEventSubmit({ editorStep: 1, key: 'Enter', target: { tagName: 'SELECT' } }), false);
  assert.equal(shouldPreventImplicitEventSubmit({ editorStep: 1, key: 'Enter', target: { tagName: 'TEXTAREA' } }), false);
  assert.equal(isIntentionalEventSubmit({ editorStep: 1, submitter: null }), false);
});

test('every non-final button inside the event editor remains an explicit non-submit control', () => {
  assert.match(eventsSource, /actions=\{<button type="button"[\s\S]*Cancel/);
  assert.match(eventsSource, /editorStep === 0 \? closeForm\(\) : moveToStep\(editorStep - 1\)/);
  assert.match(eventsSource, /<button type="button" className="btn-tertiary" onClick=\{removeSelectedImage\}/);
  assert.match(eventsSource, /<button key=\{label\} type="button"/);
  assert.match(eventsSource, /actions=\{canCreateEvent && <button[^>]*className="btn-primary"[^>]*type="button"/);
});

test('submit handler rejects non-final and unexpected submissions before validation or persistence', () => {
  const handlerStart = eventsSource.indexOf('const handleSubmit');
  const validationStart = eventsSource.indexOf('if (!validateStage(0)', handlerStart);
  const guardStart = eventsSource.indexOf('if (isSubmitting || submissionLockRef.current || !isIntentionalEventSubmit', handlerStart);
  const addStart = eventsSource.indexOf('await addEvent', handlerStart);
  assert.ok(handlerStart >= 0 && guardStart > handlerStart && validationStart > guardStart && addStart > validationStart);
  assert.match(eventsSource.slice(handlerStart, validationStart), /e\.preventDefault\(\)/);
  assert.match(eventsSource.slice(handlerStart, validationStart), /e\.nativeEvent\?\.submitter \|\| e\.submitter/);
  assert.match(eventsSource.slice(handlerStart, validationStart), /submissionLockRef\.current/);
});

test('validated date and coordinator UUID remain unchanged through final persistence', () => {
  assert.match(eventsSource, /<dd>\{form\.event_date \|\| 'Not scheduled'\}<\/dd>/);
  assert.match(eventsSource, /addEvent\(payload, selectedCoordinatorOption\.user_id\)/);
  assert.match(eventsSource, /updateEvent\(editingId, payload, selectedCoordinatorOption\.user_id\)/);
  assert.match(eventsSource, /<dd>\{selectedCoordinatorOption \? `\$\{selectedCoordinatorOption\.full_name/);
});
