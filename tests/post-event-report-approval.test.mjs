import assert from 'node:assert/strict';
import test from 'node:test';
import { createReportTransition } from '../src/services/postEventReportTransition.js';

const createRepository = (client) => {
  const transition = createReportTransition(client);
  return { approve: (id, notes = null) => transition(id, 'approved', { review_notes: notes }, 'submitted') };
};

const makeClient = ({ report, denyUpdate = false, duplicateRead = false, staleOnUpdate = false, userId = null } = {}) => {
  const state = {
    report: report ? { ...report } : null,
    exportQueue: [],
    updates: 0,
    lastPayload: null,
    lastFilters: null,
  };

  class Query {
    constructor() { this.operation = 'select'; this.payload = null; this.filters = []; }
    select() { return this; }
    update(payload) { this.operation = 'update'; this.payload = payload; return this; }
    eq(column, value) { this.filters.push([column, value]); return this; }
    then(resolve) {
      const matches = state.report && this.filters.every(([column, value]) => state.report[column] === value);
      if (this.operation === 'select') {
        const rows = matches ? [structuredClone(state.report)] : [];
        if (duplicateRead && rows.length) rows.push(structuredClone(state.report));
        return Promise.resolve(resolve({ data: rows, error: null, status: 200 }));
      }
      state.lastPayload = structuredClone(this.payload);
      state.lastFilters = structuredClone(this.filters);
      if (denyUpdate || staleOnUpdate || !matches) return Promise.resolve(resolve({ data: [], error: null, status: 200 }));
      state.report = { ...state.report, ...this.payload };
      state.updates += 1;
      if (this.payload.status === 'approved' && !state.exportQueue.includes(state.report.id)) state.exportQueue.push(state.report.id);
      return Promise.resolve(resolve({ data: [structuredClone(state.report)], error: null, status: 200 }));
    }
  }

  return {
    client: {
      from: (table) => { assert.equal(table, 'post_event_reports'); return new Query(); },
      auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }) },
    },
    state,
  };
};

test('authorized approval targets one submitted report and preserves the reviewer note', async () => {
  const { client, state } = makeClient({ report: { id: 'report-1', status: 'submitted' } });
  const result = await createRepository(client).approve('report-1', 'UAT approval for export verification');

  assert.equal(result.status, 'approved');
  assert.equal(state.updates, 1);
  assert.deepEqual(state.lastFilters, [['id', 'report-1'], ['status', 'submitted']]);
  assert.deepEqual(state.lastPayload, { status: 'approved', review_notes: 'UAT approval for export verification' });
  assert.deepEqual(state.exportQueue, ['report-1']);
});

test('zero-row approval returns a safe conflict and does not enqueue export', async () => {
  const { client, state } = makeClient({ report: { id: 'report-1', status: 'submitted' }, denyUpdate: true });
  await assert.rejects(
    () => createRepository(client).approve('report-1'),
    (error) => error.code === 'REPORT_TRANSITION_NOT_APPLIED' && !/coerce|single JSON/i.test(error.message),
  );
  assert.equal(state.updates, 0);
  assert.deepEqual(state.exportQueue, []);
});

test('submitter with reviewer role receives the specific self-approval denial', async () => {
  const { client, state } = makeClient({
    report: { id: 'report-1', status: 'submitted', submitted_by: 'submitter-1' },
    denyUpdate: true,
    userId: 'submitter-1',
  });
  await assert.rejects(
    () => createRepository(client).approve('report-1'),
    (error) => error.code === 'REPORT_SELF_APPROVAL_FORBIDDEN'
      && error.message === 'You cannot approve a report you submitted. Another authorized reviewer must review this report.',
  );
  assert.equal(state.updates, 0);
  assert.deepEqual(state.exportQueue, []);
});

test('stale submitted predicate returns a safe conflict and does not enqueue export', async () => {
  const { client, state } = makeClient({ report: { id: 'report-1', status: 'submitted' }, staleOnUpdate: true });
  await assert.rejects(
    () => createRepository(client).approve('report-1'),
    { code: 'REPORT_TRANSITION_NOT_APPLIED' },
  );
  assert.deepEqual(state.exportQueue, []);
});

test('approval rejects every non-submitted report before mutation', async () => {
  for (const status of ['approved', 'needs_revision', 'draft']) {
    const { client, state } = makeClient({ report: { id: `report-${status}`, status } });
    await assert.rejects(
      () => createRepository(client).approve(`report-${status}`),
      { code: 'REPORT_STATUS_CONFLICT' },
    );
    assert.equal(state.updates, 0);
    assert.deepEqual(state.exportQueue, []);
  }
});

test('duplicate identity is treated as an invariant failure before mutation', async () => {
  const { client, state } = makeClient({ report: { id: 'report-1', status: 'submitted' }, duplicateRead: true });
  await assert.rejects(
    () => createRepository(client).approve('report-1'),
    { code: 'REPORT_IDENTITY_CONFLICT' },
  );
  assert.equal(state.updates, 0);
});
