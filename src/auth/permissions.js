export const ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  CHAPTER_COORDINATOR: 'chapter_coordinator',
  EVENT_COORDINATOR: 'event_coordinator',
  VOLUNTEER: 'volunteer',
  PENDING_VOLUNTEER: 'pending_volunteer',
});

export const SCOPES = Object.freeze({
  NONE: 'none',
  OWN: 'own',
  ASSIGNED_EVENT: 'assigned_event',
  OWN_CHAPTER: 'own_chapter',
  NATIONWIDE: 'nationwide',
  PLATFORM: 'platform',
});

const APPROVED_ROLES = new Set(Object.values(ROLES).filter((role) => role !== ROLES.PENDING_VOLUNTEER));
const ADMIN_ROLES = new Set([ROLES.SUPER_ADMIN, ROLES.ADMIN]);

export const normalizeRole = (role) => Object.values(ROLES).includes(role) ? role : ROLES.PENDING_VOLUNTEER;
export const isApprovedRole = (role) => APPROVED_ROLES.has(normalizeRole(role));

export const ROUTE_SCOPES = Object.freeze({
  '/dashboard': { super_admin: 'nationwide', admin: 'nationwide', chapter_coordinator: 'own_chapter' },
  '/dashboard/chapters': { super_admin: 'nationwide', admin: 'nationwide', chapter_coordinator: 'own_chapter', event_coordinator: 'assigned_event' },
  '/dashboard/volunteers': { super_admin: 'nationwide', admin: 'nationwide', chapter_coordinator: 'own_chapter' },
  '/dashboard/inventory': { super_admin: 'nationwide', admin: 'nationwide', chapter_coordinator: 'own_chapter', event_coordinator: 'assigned_event' },
  '/dashboard/events': { super_admin: 'nationwide', admin: 'nationwide', chapter_coordinator: 'own_chapter', event_coordinator: 'assigned_event', volunteer: 'own' },
  '/dashboard/post-event-report': { super_admin: 'nationwide', admin: 'nationwide', chapter_coordinator: 'own_chapter', event_coordinator: 'assigned_event' },
  '/dashboard/event-checklist': { super_admin: 'nationwide', admin: 'nationwide', chapter_coordinator: 'own_chapter', event_coordinator: 'assigned_event' },
  '/dashboard/knowledge-base': { super_admin: 'platform' },
  '/dashboard/users': { super_admin: 'platform', admin: 'nationwide' },
  '/dashboard/admin': { super_admin: 'platform', admin: 'nationwide' },
  '/dashboard/faq-suggestions': { super_admin: 'platform', admin: 'nationwide' },
  '/dashboard/ai-settings': { super_admin: 'platform' },
  '/dashboard/settings': { super_admin: 'platform' },
});

export const ACTION_SCOPES = Object.freeze({
  'chapter.create': { super_admin: 'nationwide', admin: 'nationwide' },
  'chapter.update': { super_admin: 'nationwide', admin: 'nationwide', chapter_coordinator: 'own_chapter' },
  'chapter.delete': { super_admin: 'nationwide', admin: 'nationwide' },
  'event.create': { super_admin: 'nationwide', admin: 'nationwide', chapter_coordinator: 'own_chapter' },
  'event.update': { super_admin: 'nationwide', admin: 'nationwide', chapter_coordinator: 'own_chapter', event_coordinator: 'assigned_event' },
  'event.delete': { super_admin: 'nationwide', admin: 'nationwide', chapter_coordinator: 'own_chapter' },
  'event.apply': { volunteer: 'own' },
  'event.application.withdraw': { volunteer: 'own' },
  'event.application.decide': { super_admin: 'nationwide', admin: 'nationwide', chapter_coordinator: 'own_chapter', event_coordinator: 'assigned_event' },
  'event.assign_coordinator': { super_admin: 'nationwide', admin: 'nationwide', chapter_coordinator: 'own_chapter' },
  'volunteer.manage': { super_admin: 'nationwide', admin: 'nationwide', chapter_coordinator: 'own_chapter' },
  'inventory.manage': { super_admin: 'nationwide', admin: 'nationwide', chapter_coordinator: 'own_chapter' },
  'inventory.request': { event_coordinator: 'assigned_event', volunteer: 'own' },
  'inventory.request.approve': { super_admin: 'nationwide', admin: 'nationwide', chapter_coordinator: 'own_chapter' },
  'report.edit': { super_admin: 'nationwide', admin: 'nationwide', chapter_coordinator: 'own_chapter', event_coordinator: 'assigned_event' },
  'report.approve': { super_admin: 'nationwide', admin: 'nationwide' },
  'report.request_revision': { super_admin: 'nationwide', admin: 'nationwide', chapter_coordinator: 'own_chapter' },
  'report.archive': { super_admin: 'nationwide', admin: 'nationwide' },
  'knowledge.read': { super_admin: 'nationwide', admin: 'nationwide', chapter_coordinator: 'own_chapter', event_coordinator: 'assigned_event', volunteer: 'own' },
  'knowledge.manage': { super_admin: 'platform' },
  'faq.manage': { super_admin: 'platform', admin: 'nationwide' },
  'audit.read': { super_admin: 'platform', admin: 'nationwide' },
  'user.manage': { super_admin: 'platform', admin: 'nationwide' },
  'ai.settings.manage': { super_admin: 'platform' },
});

export const getRouteScope = (role, route) => ROUTE_SCOPES[route]?.[normalizeRole(role)] || SCOPES.NONE;
export const canAccessRoute = (role, route) => getRouteScope(role, route) !== SCOPES.NONE;
export const defaultRouteForRole = (role) => {
  const normalized = normalizeRole(role);
  if (normalized === ROLES.PENDING_VOLUNTEER) return '/pending-approval';
  if ([ROLES.EVENT_COORDINATOR, ROLES.VOLUNTEER].includes(normalized)) return '/dashboard/events';
  return '/dashboard';
};

const sameId = (left, right) => Boolean(left && right && left === right);
const isAssigned = (assignments = [], eventId, userId) => assignments.some((item) => item.event_id === eventId && (!userId || item.user_id === userId));

export function canAccessChapter(role, actorChapterId, targetChapterId, assignments = []) {
  const normalized = normalizeRole(role);
  if (ADMIN_ROLES.has(normalized)) return true;
  if (normalized === ROLES.CHAPTER_COORDINATOR) return sameId(actorChapterId, targetChapterId);
  if (normalized === ROLES.EVENT_COORDINATOR) return assignments.some((item) => item.chapter_id === targetChapterId);
  return false;
}

export function canAccessEvent(role, context = {}) {
  const normalized = normalizeRole(role);
  if (ADMIN_ROLES.has(normalized)) return true;
  if (normalized === ROLES.CHAPTER_COORDINATOR) return sameId(context.actorChapterId, context.event?.chapter_id);
  if (normalized === ROLES.EVENT_COORDINATOR) return isAssigned(context.assignments, context.event?.id, context.actorUserId);
  if (normalized === ROLES.VOLUNTEER) return Boolean(context.event?.is_published && context.event?.applications_open);
  return false;
}

export function canApplyToEvent(role, event, existingApplication, now = new Date()) {
  if (normalizeRole(role) !== ROLES.VOLUNTEER || existingApplication || !event?.is_published || !event?.applications_open) return false;
  if (['Completed', 'Cancelled', 'Archived', 'Closed'].includes(event.status)) return false;
  if (event.application_deadline && new Date(event.application_deadline) < now) return false;
  return !Number.isFinite(event.available_slots) || event.available_slots > 0;
}

export function canManageUser(actor, target, nextRole) {
  const actorRole = normalizeRole(actor?.roleKey || actor?.role);
  const targetRole = normalizeRole(target?.roleKey || target?.role);
  if (!ADMIN_ROLES.has(actorRole) || sameId(actor?.id, target?.id || target?.user_id)) return false;
  if (actorRole === ROLES.ADMIN && (ADMIN_ROLES.has(targetRole) || ADMIN_ROLES.has(normalizeRole(nextRole)))) return false;
  if (targetRole === ROLES.SUPER_ADMIN && target?.isFinalSuperAdmin) return false;
  return true;
}

export function canPerform(role, action, context = {}) {
  const scope = ACTION_SCOPES[action]?.[normalizeRole(role)] || SCOPES.NONE;
  if (scope === SCOPES.NONE) return false;
  if (action === 'report.approve' && sameId(context.actorUserId, context.submittedBy)) return false;
  if (action === 'event.apply') return canApplyToEvent(role, context.event, context.existingApplication, context.now);
  if (action === 'event.application.withdraw') return sameId(context.actorUserId, context.application?.volunteer_user_id) && context.application?.status === 'pending';
  if (scope === SCOPES.OWN_CHAPTER) return sameId(context.actorChapterId, context.targetChapterId || context.event?.chapter_id);
  if (scope === SCOPES.ASSIGNED_EVENT) return isAssigned(context.assignments, context.eventId || context.event?.id, context.actorUserId);
  return true;
}
