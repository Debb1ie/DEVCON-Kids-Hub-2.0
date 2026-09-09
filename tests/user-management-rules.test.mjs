import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageRoleChange } from '../src/auth/userManagementRules.js';

const base = { actorId: 'actor', targetId: 'target', targetRole: 'pending_volunteer', nextRole: 'volunteer', superAdminCount: 2 };

test('Super Admin can approve and assign all roles', () => {
  for (const nextRole of ['volunteer', 'event_coordinator', 'chapter_coordinator', 'admin', 'super_admin'])
    assert.equal(canManageRoleChange({ ...base, actorRole: 'super_admin', nextRole }), true);
});
test('Admin can manage non-administrative roles', () => assert.equal(canManageRoleChange({ ...base, actorRole: 'admin' }), true));
test('Admin cannot grant admin', () => assert.equal(canManageRoleChange({ ...base, actorRole: 'admin', nextRole: 'admin' }), false));
test('Admin cannot modify a Super Admin', () => assert.equal(canManageRoleChange({ ...base, actorRole: 'admin', targetRole: 'super_admin' }), false));
test('Non-admin roles cannot manage assignments', () => assert.equal(canManageRoleChange({ ...base, actorRole: 'chapter_coordinator' }), false));
test('Self assignment is rejected', () => assert.equal(canManageRoleChange({ ...base, actorRole: 'super_admin', targetId: 'actor' }), false));
test('Final Super Admin reassignment is rejected', () => assert.equal(canManageRoleChange({ ...base, actorRole: 'super_admin', targetRole: 'super_admin', nextRole: 'volunteer', superAdminCount: 1 }), false));
