export const EVENT_CREATE_SUBMIT = Object.freeze({
  id: 'create-event-submit',
  name: 'event-editor-action',
  value: 'create-event',
});

export const advanceEventEditor = (event, nextStage, moveToStep) => {
  event.preventDefault();
  moveToStep(nextStage);
};

export const isIntentionalEventSubmit = ({ editorStep, submitter }) => (
  editorStep === 2
  && submitter?.id === EVENT_CREATE_SUBMIT.id
  && submitter?.name === EVENT_CREATE_SUBMIT.name
  && submitter?.value === EVENT_CREATE_SUBMIT.value
  && submitter?.type === 'submit'
);

export const shouldPreventImplicitEventSubmit = ({ editorStep, key, target }) => {
  if (editorStep === 2 || key !== 'Enter' || !target) return false;
  if (target.tagName !== 'INPUT') return false;
  return !['button', 'submit', 'reset', 'checkbox', 'radio', 'file'].includes(target.type);
};
