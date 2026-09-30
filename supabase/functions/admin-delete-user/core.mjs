// Pure request logic for admin-delete-user. index.ts injects the Supabase
// calls so this file can be unit tested without a network or database.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DELETE_ERRORS = {
  invalid: 'Choose a valid user to delete.',
  self: 'You cannot delete your own account.',
  protectedAdmin: 'Only a Super Admin can delete Admin or Super Admin accounts.',
  finalSuperAdmin: 'The final Super Admin account cannot be deleted.',
  forbidden: 'You do not have permission to delete this user.',
  notFound: 'This user no longer exists. Refresh the list and try again.',
  linked: 'This user could not be deleted because their account is linked to records that must be kept, such as reports or event applications. Change their role instead.',
  unavailable: 'User deletion is temporarily unavailable. Please try again.',
};

export function mapAuthorizationError(error) {
  const message = String(error?.message || '');
  if (/user is required/i.test(message) || error?.code === '22023') return { status: 400, error: DELETE_ERRORS.invalid, code: 'INVALID_TARGET' };
  if (/own account/i.test(message)) return { status: 403, error: DELETE_ERRORS.self, code: 'SELF_DELETE' };
  if (/final Super Admin/i.test(message)) return { status: 403, error: DELETE_ERRORS.finalSuperAdmin, code: 'FINAL_SUPER_ADMIN' };
  if (/administrative accounts/i.test(message)) return { status: 403, error: DELETE_ERRORS.protectedAdmin, code: 'PROTECTED_ROLE' };
  if (/not authorized/i.test(message) || error?.code === '42501') return { status: 403, error: DELETE_ERRORS.forbidden, code: 'FORBIDDEN' };
  if (/role assignment|not found/i.test(message) || error?.code === 'P0002') return { status: 404, error: DELETE_ERRORS.notFound, code: 'NOT_FOUND' };
  return { status: 503, error: DELETE_ERRORS.unavailable, code: 'AUTHORIZATION_UNAVAILABLE' };
}

/**
 * @param {{ callerId: string, body: any, authorize: (id: string) => PromiseLike<any>, deleteAuthUser: (id: string) => PromiseLike<any>, audit: (row: Record<string, unknown>) => PromiseLike<any>, log?: (fields: Record<string, unknown>) => void }} deps
 */
export async function handleDeleteUser({ callerId, body, authorize, deleteAuthUser, audit, log = () => {} }) {
  const targetUserId = typeof body?.target_user_id === 'string' ? body.target_user_id.trim() : '';
  if (!UUID.test(targetUserId)) return { status: 400, body: { error: DELETE_ERRORS.invalid, code: 'INVALID_TARGET' } };
  if (targetUserId === callerId) return { status: 403, body: { error: DELETE_ERRORS.self, code: 'SELF_DELETE' } };

  // Authorization runs in Postgres as the caller (admin_authorize_user_deletion).
  const authorization = await authorize(targetUserId);
  if (authorization.error) {
    const mapped = mapAuthorizationError(authorization.error);
    return { status: mapped.status, body: { error: mapped.error, code: mapped.code } };
  }
  const target = Array.isArray(authorization.data) ? authorization.data[0] : authorization.data;
  if (!target?.deleted_user_id || target.deleted_user_id !== targetUserId) {
    return { status: 404, body: { error: DELETE_ERRORS.notFound, code: 'NOT_FOUND' } };
  }

  const auditRow = (action, extra = {}) => ({
    actor_id: callerId,
    action,
    target_table: 'auth.users',
    target_id: targetUserId,
    metadata: { email: target.deleted_email || null, name: target.deleted_name || null, role: target.deleted_role || null, ...extra },
  });
  const writeAudit = async (row) => {
    try {
      const result = await audit(row);
      return !result?.error;
    } catch {
      return false;
    }
  };

  // Every deletion attempt is recorded before anything is removed. If the
  // audit trail cannot be written, nothing is deleted.
  if (!(await writeAudit(auditRow('USER_DELETE_REQUESTED')))) {
    log({ event: 'audit_unavailable' });
    return { status: 503, body: { error: DELETE_ERRORS.unavailable, code: 'AUDIT_UNAVAILABLE' } };
  }

  const removal = await deleteAuthUser(targetUserId);
  if (removal.error) {
    log({ event: 'delete_failed', status: removal.error.status ?? null, safeError: String(removal.error.message || '').slice(0, 160) });
    let response = { status: 409, body: { error: DELETE_ERRORS.linked, code: 'LINKED_RECORDS' } };
    if (Number(removal.error.status) === 404) response = { status: 404, body: { error: DELETE_ERRORS.notFound, code: 'NOT_FOUND' } };
    else {
      // Auth reports database refusals generically. Re-run the authorization to
      // tell a concurrent final-Super-Admin refusal apart from linked records.
      const recheck = await Promise.resolve().then(() => authorize(targetUserId)).catch(() => null);
      if (recheck?.error) {
        const mapped = mapAuthorizationError(recheck.error);
        if (mapped.status !== 503) response = { status: mapped.status === 404 ? 404 : 409, body: { error: mapped.error, code: mapped.code } };
      }
    }
    await writeAudit(auditRow('USER_DELETE_FAILED', { reason: response.body.code }));
    return response;
  }

  // The account is gone; retry the completion entry once and log if it still fails.
  if (!(await writeAudit(auditRow('USER_DELETED'))) && !(await writeAudit(auditRow('USER_DELETED')))) {
    log({ event: 'audit_failed_after_delete' });
  }

  return { status: 200, body: { deleted: true, user_id: targetUserId } };
}
