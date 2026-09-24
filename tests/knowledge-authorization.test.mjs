import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLES } from '../src/auth/permissions.js';
import { assertKnowledgeManager, KnowledgeAuthorizationError } from '../src/services/knowledgeAuthorization.js';

test('only Super Admin passes the management service boundary', () => {
  for (const role of Object.values(ROLES)) {
    if (role === ROLES.SUPER_ADMIN) {
      assert.doesNotThrow(() => assertKnowledgeManager(role));
    } else {
      assert.throws(() => assertKnowledgeManager(role), KnowledgeAuthorizationError, role);
    }
  }
});

test('unknown and missing roles fail with a safe authorization error', () => {
  for (const role of [undefined, null, '', 'invented_role']) {
    assert.throws(
      () => assertKnowledgeManager(role),
      (error) => error instanceof KnowledgeAuthorizationError
        && error.message === 'You do not have permission to manage knowledge sources.',
    );
  }
});
