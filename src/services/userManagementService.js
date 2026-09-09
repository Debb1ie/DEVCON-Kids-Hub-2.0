import { supabase } from '../lib/supabase';

export const USER_ROLES = [
  'pending_volunteer', 'volunteer', 'event_coordinator',
  'chapter_coordinator', 'admin', 'super_admin',
];

export async function listManagedUsers() {
  const { data, error } = await supabase.rpc('admin_list_users');
  if (error) throw error;
  return data || [];
}

export async function changeManagedUserRole(userId, role, chapterId) {
  const { error } = await supabase.rpc('admin_manage_user_role', {
    target_user_id: userId,
    new_role: role,
    new_chapter_id: chapterId || null,
  });
  if (error) throw error;
}
