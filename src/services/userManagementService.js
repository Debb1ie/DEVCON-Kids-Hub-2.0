import { supabase } from '../lib/supabase';
import { validateLocationSelection } from '../auth/locationRules';

export const USER_ROLES = [
  'pending_volunteer', 'volunteer', 'event_coordinator',
  'chapter_coordinator', 'admin', 'super_admin',
];

export const CHAPTER_REQUIRED_ROLES = ['volunteer', 'event_coordinator', 'chapter_coordinator'];

export async function listAssignableLocations() {
  const { data, error } = await supabase.rpc('admin_list_assignable_locations');
  if (error) throw new Error('The location directory could not be loaded.');
  return data || [];
}

export async function listManagedUsers({ search = null, role = null, chapterId = null } = {}) {
  const { data, error } = await supabase.rpc('admin_list_users', {
    search_query: search || null,
    role_filter: role || null,
    chapter_filter: chapterId || null,
  });
  if (error) throw error;
  return data || [];
}

export async function changeManagedUserRole(userId, role, chapterId, locations = []) {
  validateLocationSelection(role, chapterId, locations, CHAPTER_REQUIRED_ROLES);
  const { error } = await supabase.rpc('admin_manage_user_role', {
    target_user_id: userId,
    new_role: role,
    new_chapter_id: chapterId || null,
  });
  if (error) throw new Error('The role could not be updated.');
}

const DELETE_FALLBACK = 'The user could not be deleted. Please try again.';

// Deletion runs in the admin-delete-user Edge Function, which re-checks the
// caller's authority in the database before using its server-side service role.
export async function deleteManagedUser(userId) {
  const { data, error } = await supabase.functions.invoke('admin-delete-user', {
    body: { target_user_id: userId },
  });
  if (error) {
    const payload = await error.context?.json?.().catch(() => null);
    throw new Error(typeof payload?.error === 'string' && payload.error ? payload.error : DELETE_FALLBACK);
  }
  if (!data?.deleted) throw new Error(DELETE_FALLBACK);
}
