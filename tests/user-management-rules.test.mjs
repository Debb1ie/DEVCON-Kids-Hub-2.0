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

import {
  assignableRolesFor,
  canDeleteManagedUser,
  getManagedUserAccess,
  getRowSaveState,
  runUserDeletion,
} from '../src/auth/userManagementRules.js';

const locations = [
  { location_id: 'manila', display_name: 'Manila', location_type: 'chapter', is_active: true },
  { location_id: 'cebu', display_name: 'Cebu', location_type: 'chapter', is_active: true },
];
const adminRow = { user_id: 't1', role: 'admin', chapter_id: null };
const coordinatorManila = { user_id: 't2', role: 'event_coordinator', chapter_id: 'manila' };
const superRow = { user_id: 's1', email: 'root@example.org', role: 'super_admin', chapter_id: null };

test('1. Save enables when the role changes and its location is chosen (Example A)', () => {
  const state = getRowSaveState({ original: adminRow, role: 'event_coordinator', chapterId: 'manila', locations });
  assert.equal(state.dirty, true);
  assert.equal(state.disabled, false);
});
test('1b. Save enables for a role change that needs no location', () => {
  assert.equal(getRowSaveState({ original: coordinatorManila, role: 'admin', chapterId: '', locations }).disabled, false);
});
test('2. Save enables when only the location changes (Example C)', () => {
  const state = getRowSaveState({ original: coordinatorManila, role: 'event_coordinator', chapterId: 'cebu', locations });
  assert.equal(state.dirty, true);
  assert.equal(state.disabled, false);
});
test('3. Save disables when nothing changed (Example D)', () => {
  const state = getRowSaveState({ original: coordinatorManila, role: 'event_coordinator', chapterId: 'manila', locations });
  assert.equal(state.dirty, false);
  assert.equal(state.disabled, true);
});
test('4. Save disables with a clear hint while a required location is missing (Example B)', () => {
  const state = getRowSaveState({ original: adminRow, role: 'event_coordinator', chapterId: '', locations });
  assert.equal(state.disabled, true);
  assert.equal(state.missingLocation, true);
  assert.match(state.hint, /Select a location/);
});
test('Save disables while the row is saving or when the row is read-only', () => {
  const args = { original: adminRow, role: 'event_coordinator', chapterId: 'manila', locations };
  assert.equal(getRowSaveState({ ...args, saving: true }).disabled, true);
  assert.equal(getRowSaveState({ ...args, canEdit: false }).disabled, true);
});

test('5. Admin cannot edit a Super Admin (Example E) or an Admin peer', () => {
  for (const target of [superRow, adminRow]) {
    const access = getManagedUserAccess({ actorRole: 'admin', actorId: 'a1', target });
    assert.equal(access.canEdit, false);
    assert.match(access.reason, /Only a Super Admin/);
  }
  assert.deepEqual(assignableRolesFor('admin'), ['pending_volunteer', 'volunteer', 'event_coordinator', 'chapter_coordinator']);
});
test('6. Admin cannot delete a Super Admin or Admin', () => {
  assert.equal(canDeleteManagedUser({ actorRole: 'admin', actorId: 'a1', targetId: 's1', targetRole: 'super_admin' }), false);
  assert.equal(canDeleteManagedUser({ actorRole: 'admin', actorId: 'a1', targetId: 't1', targetRole: 'admin' }), false);
  assert.equal(getManagedUserAccess({ actorRole: 'admin', actorId: 'a1', target: superRow }).canDelete, false);
});
test('7. Admin can edit lower roles', () => {
  for (const role of ['pending_volunteer', 'volunteer', 'event_coordinator', 'chapter_coordinator']) {
    assert.equal(getManagedUserAccess({ actorRole: 'admin', actorId: 'a1', target: { user_id: 'x', role } }).canEdit, true);
  }
});
test('8. Admin can delete lower roles', () => {
  for (const role of ['pending_volunteer', 'volunteer', 'event_coordinator', 'chapter_coordinator']) {
    assert.equal(canDeleteManagedUser({ actorRole: 'admin', actorId: 'a1', targetId: 'x', targetRole: role }), true);
  }
});
test('9. Super Admin can edit and delete Admin, lower roles and other Super Admins', () => {
  for (const role of ['pending_volunteer', 'volunteer', 'event_coordinator', 'chapter_coordinator', 'admin', 'super_admin']) {
    const access = getManagedUserAccess({ actorRole: 'super_admin', actorId: 's0', target: { user_id: 'x', role }, superAdminCount: 2 });
    assert.equal(access.canEdit, true);
    assert.equal(access.canDelete, true);
  }
  assert.equal(assignableRolesFor('super_admin').includes('super_admin'), true);
});
test('10. Self role change stays blocked, matched by id or email', () => {
  assert.equal(getManagedUserAccess({ actorRole: 'super_admin', actorId: 's1', target: superRow }).canEdit, false);
  assert.equal(getManagedUserAccess({ actorRole: 'super_admin', actorEmail: 'ROOT@example.org', target: superRow }).canEdit, false);
});
test('11. Self deletion stays blocked', () => {
  assert.equal(canDeleteManagedUser({ actorRole: 'super_admin', actorId: 's1', targetId: 's1', targetRole: 'super_admin' }), false);
  assert.equal(getManagedUserAccess({ actorRole: 'super_admin', actorId: 's1', target: superRow }).canDelete, false);
});
test('Final Super Admin cannot be deleted', () => {
  assert.equal(canDeleteManagedUser({ actorRole: 'super_admin', actorId: 's0', targetId: 's1', targetRole: 'super_admin', superAdminCount: 1 }), false);
});
test('13. Successful delete removes only that user', async () => {
  const users = [adminRow, coordinatorManila];
  const result = await runUserDeletion({ users, target: adminRow, remove: async () => {} });
  assert.equal(result.ok, true);
  assert.deepEqual(result.users.map((u) => u.user_id), ['t2']);
});
test('14. Failed delete keeps the user and reports the error', async () => {
  const users = [adminRow, coordinatorManila];
  const result = await runUserDeletion({ users, target: adminRow, remove: async () => { throw new Error('Linked records'); } });
  assert.equal(result.ok, false);
  assert.equal(result.users, users);
  assert.equal(result.message, 'Linked records');
});
