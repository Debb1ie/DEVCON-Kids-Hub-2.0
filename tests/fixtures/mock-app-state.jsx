const manilaId = '11111111-1111-4111-8111-111111111111';
const lagunaId = '22222222-2222-4222-8222-222222222222';
const coordinatorId = '33333333-3333-4333-8333-333333333333';

const calls = globalThis.__eventHarnessCalls ||= {
  addEvent: 0,
  updateEvent: 0,
  uploadEventImage: 0,
  deleteEvent: 0
};

const context = {
  eventsList: [],
  volunteersList: [],
  chapters: [
    { id: manilaId, name: 'Manila', status: 'active' },
    { id: lagunaId, name: 'Laguna', status: 'active' }
  ],
  roleKey: 'super_admin',
  user: { id: '44444444-4444-4444-8444-444444444444', chapterId: manilaId, name: 'Local Super Admin', role: 'Super Admin' },
  themeMode: 'light',
  toggleThemeMode() {},
  logout() {},
  listEligibleEventCoordinators: async (chapterId) => chapterId === manilaId ? [{
    user_id: coordinatorId,
    full_name: 'Sinag Exe',
    email: 'sinag@example.test',
    chapter_id: manilaId
  }] : [],
  addEvent: async () => { calls.addEvent += 1; throw new Error('Harness must not save.'); },
  updateEvent: async () => { calls.updateEvent += 1; throw new Error('Harness must not save.'); },
  uploadEventImage: async () => { calls.uploadEventImage += 1; throw new Error('Harness must not upload.'); },
  deleteEvent: async () => { calls.deleteEvent += 1; throw new Error('Harness must not delete.'); }
};

export const useApp = () => context;
