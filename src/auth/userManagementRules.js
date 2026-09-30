export const ADMINISTRATIVE_ROLES = ['admin', 'super_admin'];
export const CHAPTER_ROLES = ['volunteer', 'event_coordinator', 'chapter_coordinator'];
export const MANAGEABLE_ROLES = ['pending_volunteer', 'volunteer', 'event_coordinator', 'chapter_coordinator', 'admin', 'super_admin'];

export const roleRequiresLocation = (role) => CHAPTER_ROLES.includes(role);

export function canManageRoleChange({ actorRole, actorId, targetId, targetRole, nextRole, superAdminCount = 2 }) {
  if (!ADMINISTRATIVE_ROLES.includes(actorRole)) return false;
  if (actorId && targetId && actorId === targetId) return false;
  if (actorRole === 'admin' && (ADMINISTRATIVE_ROLES.includes(targetRole) || ADMINISTRATIVE_ROLES.includes(nextRole))) return false;
  if (targetRole === 'super_admin' && nextRole !== 'super_admin' && superAdminCount <= 1) return false;
  return true;
}

// Mirrors public.admin_authorize_user_deletion. The database function is the
// authority; this copy only decides what the UI offers.
export function canDeleteManagedUser({ actorRole, actorId, targetId, targetRole, superAdminCount = 2 }) {
  if (!ADMINISTRATIVE_ROLES.includes(actorRole)) return false;
  if (!targetId || (actorId && actorId === targetId)) return false;
  if (actorRole === 'admin' && ADMINISTRATIVE_ROLES.includes(targetRole)) return false;
  if (targetRole === 'super_admin' && superAdminCount <= 1) return false;
  return true;
}

export const assignableRolesFor = (actorRole) =>
  actorRole === 'super_admin'
    ? MANAGEABLE_ROLES
    : actorRole === 'admin'
      ? MANAGEABLE_ROLES.filter((role) => !ADMINISTRATIVE_ROLES.includes(role))
      : [];

const isSameAccount = (actor, target) =>
  Boolean(
    (actor.id && target.user_id && actor.id === target.user_id)
    || (actor.email && target.email && actor.email.toLowerCase() === target.email.toLowerCase())
  );

export function getManagedUserAccess({ actorRole, actorId, actorEmail, target, superAdminCount = 2 }) {
  const isSelf = isSameAccount({ id: actorId, email: actorEmail }, target);
  if (!ADMINISTRATIVE_ROLES.includes(actorRole)) {
    return { isSelf, canEdit: false, canDelete: false, reason: 'You do not have permission to manage users.' };
  }
  if (isSelf) {
    return { isSelf, canEdit: false, canDelete: false, reason: 'Your own role and account cannot be changed here.' };
  }
  if (actorRole === 'admin' && ADMINISTRATIVE_ROLES.includes(target.role)) {
    const who = target.role === 'super_admin' ? 'Super Admin' : 'Admin';
    return { isSelf, canEdit: false, canDelete: false, reason: `Only a Super Admin can manage ${who} accounts.` };
  }
  const canDelete = canDeleteManagedUser({ actorRole, actorId, targetId: target.user_id, targetRole: target.role, superAdminCount });
  return {
    isSelf,
    canEdit: true,
    canDelete,
    reason: canDelete ? '' : 'The final Super Admin account cannot be deleted.',
  };
}

const isActiveLocation = (locationId, locations) =>
  Boolean(locationId) && locations.some((location) => location.location_id === locationId && location.is_active);

export function getRowSaveState({ original, role, chapterId, locations = [], canEdit = true, saving = false }) {
  const originalChapter = original.chapter_id || '';
  const requiresLocation = roleRequiresLocation(role);
  const nextChapter = requiresLocation ? chapterId || '' : '';
  const dirty = role !== original.role || (requiresLocation && nextChapter !== originalChapter);
  const missingLocation = requiresLocation && !isActiveLocation(nextChapter, locations);
  return {
    dirty,
    requiresLocation,
    missingLocation,
    disabled: !canEdit || saving || !dirty || missingLocation,
    hint: canEdit && dirty && missingLocation ? 'Select a location to assign this role.' : '',
  };
}

export const managedUserName = (item) => item?.full_name || item?.email || 'this user';

export async function runUserDeletion({ users, target, remove }) {
  try {
    await remove(target.user_id);
    return {
      ok: true,
      users: users.filter((item) => item.user_id !== target.user_id),
      message: `${managedUserName(target)} was deleted.`,
    };
  } catch (cause) {
    return { ok: false, users, message: cause?.message || 'The user could not be deleted.' };
  }
}
