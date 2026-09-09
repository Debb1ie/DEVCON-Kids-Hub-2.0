import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessChapter, canAccessEvent, canAccessRoute, canApplyToEvent, canManageUser, canPerform, defaultRouteForRole, ROLES } from '../src/auth/permissions.js';

const roles = Object.values(ROLES);

test('unknown and missing roles deny protected access', () => {
  assert.equal(canAccessRoute(undefined, '/dashboard/events'), false);
  assert.equal(canAccessRoute('invented_role', '/dashboard/users'), false);
  assert.equal(defaultRouteForRole(undefined), '/pending-approval');
});

test('route matrix enforces all six roles', () => {
  for (const role of roles) assert.equal(canAccessRoute(role, '/dashboard/settings'), role === ROLES.SUPER_ADMIN);
  assert.equal(canAccessRoute(ROLES.VOLUNTEER, '/dashboard/events'), true);
  assert.equal(canAccessRoute(ROLES.VOLUNTEER, '/dashboard/post-event-report'), false);
  assert.equal(canAccessRoute(ROLES.PENDING_VOLUNTEER, '/dashboard/events'), false);
});

test('Knowledge Base management is Super Admin-only for every route and action check', () => {
  for (const role of roles) {
    const expected = role === ROLES.SUPER_ADMIN;
    assert.equal(canAccessRoute(role, '/dashboard/knowledge-base'), expected, `${role} route`);
    assert.equal(canPerform(role, 'knowledge.manage'), expected, `${role} management action`);
  }
});

test('chapter access is nationwide, own chapter, or assigned-event scoped', () => {
  assert.equal(canAccessChapter(ROLES.ADMIN, 'a', 'b'), true);
  assert.equal(canAccessChapter(ROLES.CHAPTER_COORDINATOR, 'a', 'a'), true);
  assert.equal(canAccessChapter(ROLES.CHAPTER_COORDINATOR, 'a', 'b'), false);
  assert.equal(canAccessChapter(ROLES.EVENT_COORDINATOR, null, 'b', [{ chapter_id: 'b' }]), true);
});

test('event coordinator access requires explicit assignment', () => {
  const event = { id: 'event-1', chapter_id: 'chapter-1' };
  assert.equal(canAccessEvent(ROLES.EVENT_COORDINATOR, { actorUserId: 'u1', event, assignments: [{ event_id: 'event-1', user_id: 'u1' }] }), true);
  assert.equal(canAccessEvent(ROLES.EVENT_COORDINATOR, { actorUserId: 'u2', event, assignments: [{ event_id: 'event-1', user_id: 'u1' }] }), false);
});

test('volunteer applications enforce publication, state, deadline, capacity, and duplicates', () => {
  const open = { is_published: true, applications_open: true, status: 'Scheduled', available_slots: 2, application_deadline: '2099-01-01' };
  assert.equal(canApplyToEvent(ROLES.VOLUNTEER, open, null, new Date('2026-01-01')), true);
  assert.equal(canApplyToEvent(ROLES.PENDING_VOLUNTEER, open), false);
  assert.equal(canApplyToEvent(ROLES.VOLUNTEER, open, { status: 'rejected' }), false);
  assert.equal(canApplyToEvent(ROLES.VOLUNTEER, { ...open, applications_open: false }), false);
  assert.equal(canApplyToEvent(ROLES.VOLUNTEER, { ...open, application_deadline: '2025-01-01' }, null, new Date('2026-01-01')), false);
  assert.equal(canApplyToEvent(ROLES.VOLUNTEER, { ...open, available_slots: 0 }), false);
});

test('application withdrawal is own pending only', () => {
  assert.equal(canPerform(ROLES.VOLUNTEER, 'event.application.withdraw', { actorUserId: 'u1', application: { volunteer_user_id: 'u1', status: 'pending' } }), true);
  assert.equal(canPerform(ROLES.VOLUNTEER, 'event.application.withdraw', { actorUserId: 'u1', application: { volunteer_user_id: 'u2', status: 'pending' } }), false);
  assert.equal(canPerform(ROLES.VOLUNTEER, 'event.application.withdraw', { actorUserId: 'u1', application: { volunteer_user_id: 'u1', status: 'accepted' } }), false);
});

test('report submitter cannot self-approve', () => {
  assert.equal(canPerform(ROLES.ADMIN, 'report.approve', { actorUserId: 'u1', submittedBy: 'u1' }), false);
  assert.equal(canPerform(ROLES.ADMIN, 'report.approve', { actorUserId: 'u1', submittedBy: 'u2' }), true);
  assert.equal(canPerform(ROLES.CHAPTER_COORDINATOR, 'report.approve', { actorUserId: 'u1', submittedBy: 'u2' }), false);
});

test('user management protects self, administrators, and final Super Admin', () => {
  assert.equal(canManageUser({ id: 'a', role: ROLES.ADMIN }, { id: 'a', role: ROLES.VOLUNTEER }, ROLES.VOLUNTEER), false);
  assert.equal(canManageUser({ id: 'a', role: ROLES.ADMIN }, { id: 'b', role: ROLES.ADMIN }, ROLES.VOLUNTEER), false);
  assert.equal(canManageUser({ id: 's1', role: ROLES.SUPER_ADMIN }, { id: 's2', role: ROLES.SUPER_ADMIN, isFinalSuperAdmin: true }, ROLES.ADMIN), false);
  assert.equal(canManageUser({ id: 's1', role: ROLES.SUPER_ADMIN }, { id: 'v1', role: ROLES.VOLUNTEER }, ROLES.ADMIN), true);
});
