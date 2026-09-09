export const ADMINISTRATIVE_ROLES = ['admin', 'super_admin'];
export const CHAPTER_ROLES = ['volunteer', 'event_coordinator', 'chapter_coordinator'];

export function canManageRoleChange({ actorRole, actorId, targetId, targetRole, nextRole, superAdminCount = 2 }) {
  if (!ADMINISTRATIVE_ROLES.includes(actorRole)) return false;
  if (actorId && targetId && actorId === targetId) return false;
  if (actorRole === 'admin' && (ADMINISTRATIVE_ROLES.includes(targetRole) || ADMINISTRATIVE_ROLES.includes(nextRole))) return false;
  if (targetRole === 'super_admin' && nextRole !== 'super_admin' && superAdminCount <= 1) return false;
  return true;
}
