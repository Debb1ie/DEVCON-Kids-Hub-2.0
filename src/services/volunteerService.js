export const VOLUNTEER_STATUSES = Object.freeze({
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  active: 'Active',
  inactive: 'Inactive',
});

const normalizeKey = (value = '') => String(value).trim().toLowerCase().replace(/[\s-]+/g, '_');

export const MAX_VOLUNTEER_ROLE_LENGTH = 100;

export const normalizeVolunteerRole = (value) => {
  const role = String(value || '').trim();
  return role && role.length <= MAX_VOLUNTEER_ROLE_LENGTH ? role : null;
};

export const normalizeVolunteerStatus = (value) => {
  const key = normalizeKey(value);
  return Object.hasOwn(VOLUNTEER_STATUSES, key) ? key : null;
};

export const volunteerRoleLabel = (value) => String(value || '—').trim() || '—';

export const volunteerStatusLabel = (value) =>
  VOLUNTEER_STATUSES[normalizeVolunteerStatus(value)] || String(value || '—');

export function buildVolunteerPayload(input = {}) {
  const name = String(input.name || '').trim();
  const role = normalizeVolunteerRole(input.role);
  const status = normalizeVolunteerStatus(input.status);
  const chapterId = String(input.chapter_id || input.chapterId || '').trim();

  if (!name || !role || !status || !chapterId) {
    throw Object.assign(new Error('Invalid volunteer details.'), { code: 'VOLUNTEER_VALIDATION' });
  }

  return { name, role, status, chapter_id: chapterId };
}

export function volunteerErrorMessage(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();

  if (code === 'VOLUNTEER_VALIDATION' || code === '23502' || code === '22P02' || code === '23514') {
    return 'Please check the volunteer details and try again.';
  }
  if (code === '42501' || message.includes('row-level security') || message.includes('permission')) {
    return "You don't have permission to add a volunteer to this chapter.";
  }
  if (code === '23505') return 'This volunteer already exists.';
  return 'Unable to add volunteer right now. Please try again.';
}

export function sanitizedVolunteerError(error) {
  return {
    code: error?.code || null,
    message: error?.message || null,
    details: error?.details || null,
    hint: error?.hint || null,
  };
}
