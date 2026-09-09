/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { AUTH_CALLBACK_PATH, buildOAuthRedirectUrl, clearAuthSession } from '../auth/authFlow';

const AppContext = createContext();

const getStoredThemeMode = () => {
  if (typeof window === 'undefined') return 'light';

  const saved = localStorage.getItem('themeMode');
  if (saved === 'light' || saved === 'dark') return saved;

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const applyThemeMode = (themeMode) => {
  if (typeof document === 'undefined') return;

  const body = document.body;
  const root = document.documentElement;
  if (themeMode === 'dark') {
    body.classList.add('dark-mode');
    root.style.colorScheme = 'dark';
  } else {
    body.classList.remove('dark-mode');
    root.style.colorScheme = 'light';
  }
};

const defaultDashboardSettings = {
  showCourseSpotlight: true,
  showGrowthChart: true,
  showChapterOverview: true,
  compactCards: false,
  showQuickActions: true,
  autoOpenAIChat: false
};

const loadDashboardSettings = () => {
  if (typeof window === 'undefined') return defaultDashboardSettings;

  try {
    const parsed = JSON.parse(localStorage.getItem('dashboardSettings') || '{}');
    return { ...defaultDashboardSettings, ...parsed };
  } catch {
    return defaultDashboardSettings;
  }
};

const normalizeFolderName = (value = '') =>
  value
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ');

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  chapter_coordinator: 'Chapter Coordinator',
  event_coordinator: 'Event Coordinator',
  volunteer: 'Volunteer',
  pending_volunteer: 'Pending Volunteer'
};

const ROLE_PRIORITY = Object.keys(ROLE_LABELS);

const buildUserProfile = (sessionUser, assignment = null) => ({
  id: sessionUser.id,
  email: sessionUser.email,
  name: sessionUser.user_metadata?.name || sessionUser.user_metadata?.full_name || sessionUser.email,
  role: ROLE_LABELS[assignment?.role] || 'Pending Volunteer',
  roleKey: assignment?.role || 'pending_volunteer',
  chapterId: assignment?.chapter_id || null
});

const loadUserProfile = async (sessionUser) => {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role, chapter_id')
    .eq('user_id', sessionUser.id);

  if (error) {
    console.warn('[Auth] Unable to load user role; using safe pending access.', error);
    return buildUserProfile(sessionUser);
  }

  const assignments = data || [];
  const assignment = ROLE_PRIORITY
    .map((role) => assignments.find((item) => item.role === role))
    .find(Boolean);

  return buildUserProfile(sessionUser, assignment);
};

const buildEventFolderMetadata = (event) => {
  const safeTitle = normalizeFolderName(event.title || 'New Event');
  const folderRoot = 'Google Drive/DEVCON Kids/Events';

  return {
    ...event,
    google_folder_name: event.google_folder_name || safeTitle,
    google_folder_path: event.google_folder_path || `${folderRoot}/${safeTitle}`,
    google_assets_path: event.google_assets_path || `${folderRoot}/${safeTitle}/Assets`,
    google_folder_status: event.google_folder_status || 'Queued for Google Drive sync'
  };
};

const upsertRecord = (setList, record) => {
  setList((current) => {
    const index = current.findIndex((item) => item.id === record.id);
    if (index === -1) {
      return [...current, record];
    }

    const next = [...current];
    next[index] = record;
    return next;
  });
};

const fetchChapters = async (supabase, setChapters, setStats) => {
  try {
    const { data, error } = await supabase.from('chapters').select('*');
    if (error) throw error;
    setChapters(data || []);
    setStats((prev) => ({ ...prev, activeChapters: data?.length || 0 }));
  } catch (e) {
    setChapters([]);
    setStats((prev) => ({ ...prev, activeChapters: 0 }));
    console.warn('Unable to load authorized chapters.', e);
  }
};

const fetchVolunteers = async (supabase, setVolunteersList) => {
  try {
    const { data, error } = await supabase.from('volunteers').select('*');
    if (error) throw error;
    if (data) setVolunteersList(data);
  } catch (e) {
    setVolunteersList([]);
    console.warn('Unable to load authorized volunteers.', e);
  }
};

const fetchInventory = async (supabase, setInventoryList) => {
  try {
    const { data, error } = await supabase.from('inventory').select('*');
    if (error) throw error;
    if (data) setInventoryList(data);
  } catch (e) {
    setInventoryList([]);
    console.warn('Unable to load authorized inventory.', e);
  }
};

const fetchSocialPosts = async (supabase, setSocialPosts) => {
  try {
    const { data, error } = await supabase.from('social_media_posts').select('*');
    if (error) throw error;
    if (data) setSocialPosts(data);
  } catch (e) {
    setSocialPosts([]);
    console.warn('Unable to load authorized social posts.', e);
  }
};

const fetchEvents = async (supabase, setEventsList) => {
  try {
    const { data, error } = await supabase.from('events').select('*');
    if (error) throw error;
    setEventsList(data || []);
  } catch (e) {
    setEventsList([]);
    console.warn('Unable to load authorized events.', e);
  }
};

export const AppProvider = ({ children }) => {
  const [stats, setStats] = useState({
    learnersReached: 12450,
    successfulWorkshops: 142,
    activeChapters: 11,
    volunteers: 850,
    hourOfAIStudents: 0
  });

  const [chapters, setChapters] = useState([]);
  const [volunteersList, setVolunteersList] = useState([]);
  const [inventoryList, setInventoryList] = useState([]);
  const [socialPosts, setSocialPosts] = useState([]);
  const [eventsList, setEventsList] = useState([]);

  const [growthData] = useState([
    { month: 'Jan', learners: 5000 },
    { month: 'Feb', learners: 6200 },
    { month: 'Mar', learners: 7800 },
    { month: 'Apr', learners: 9500 },
    { month: 'May', learners: 12450 }
  ]);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [themeMode, setThemeModeState] = useState(getStoredThemeMode);
  const [dashboardSettings, setDashboardSettings] = useState(loadDashboardSettings);

  const acceptSession = useCallback(async (session) => {
    if (!session?.user) return false;
    const profile = await loadUserProfile(session.user);
    setUser(profile);
    setIsAuthenticated(true);
    setAuthLoading(false);
    return profile;
  }, []);

  useEffect(() => {
    applyThemeMode(themeMode);
    try {
      localStorage.setItem('themeMode', themeMode);
    } catch {
      // ignore storage failures
    }
  }, [themeMode]);

  useEffect(() => {
    try {
      localStorage.setItem('dashboardSettings', JSON.stringify(dashboardSettings));
    } catch {
      // ignore storage failures
    }
  }, [dashboardSettings]);

  // Load protected workspace data only after the user's approved role is known.
  useEffect(() => {
    if (!isAuthenticated || user?.roleKey === 'pending_volunteer') return;
    fetchChapters(supabase, setChapters, setStats);
    fetchVolunteers(supabase, setVolunteersList);
    fetchInventory(supabase, setInventoryList);
    fetchSocialPosts(supabase, setSocialPosts);
    fetchEvents(supabase, setEventsList);
  }, [isAuthenticated, user?.roleKey]);

  // Sync Supabase auth session on mount and listen for changes
  useEffect(() => {
    let mounted = true;
    const isOAuthCallback =
      typeof window !== 'undefined' && window.location.pathname === AUTH_CALLBACK_PATH;

    const finishLoading = () => {
      if (mounted) setAuthLoading(false);
    };

    const syncSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        const session = data?.session;
        if (error) console.warn('[Auth] getSession() error:', error);
        if (session?.user && mounted) {
          await acceptSession(session);
          return;
        }
      } catch (e) {
        console.warn('[Auth] getSession() failed immediately:', e);
      }

      // The public callback route owns the PKCE exchange. Keep the loading gate
      // active so no protected route can redirect before that exchange finishes.
      if (!isOAuthCallback) {
        setIsAuthenticated(false);
        setUser(null);
        finishLoading();
      }
    };

    void syncSession();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          void acceptSession(session);
        } else {
          setIsAuthenticated(false);
          setUser(null);
          finishLoading();
        }
      }
    );

    return () => {
      mounted = false;
      if (listener && listener.subscription) listener.subscription.unsubscribe();
    };
  }, [acceptSession]);

  // Auth Actions
  const loginWithGoogle = async () => {
    try {
      const redirectUrl = buildOAuthRedirectUrl(window.location.origin);
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      
      if (error) throw error;
      
      if (data?.url) {
        if (typeof window !== 'undefined') {
          window.location.href = data.url;
          return { success: true };
        }
      }
      
      return { success: true, data };
    } catch (error) {
      return { success: false, error };
    }
  };

  const logout = async () => {
    try {
      await clearAuthSession(supabase.auth);
    } catch (error) {
      console.warn('Sign out failed', error);
    }

    try {
      sessionStorage.removeItem('oauth_in_progress');
      sessionStorage.removeItem('auth_session');
    } catch {
      // ignore storage cleanup errors
    }

    setIsAuthenticated(false);
    setUser(null);
  };

  // Supabase CRUD Actions
  
  const logAuditAction = async (action, targetTable, targetId = null, metadata = {}) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const actorId = session?.user?.id || null;
      await supabase.from('audit_logs').insert([{
        actor_id: actorId,
        action,
        target_table: targetTable,
        target_id: targetId,
        metadata
      }]);
    } catch (e) {
      console.warn("Audit log failed", e);
    }
  };

  const addChapter = async (chapter) => {
    const payload = { ...chapter };
    const { data, error } = await supabase.from('chapters').insert([payload]).select();
    if (error) throw error;
    if (data?.[0]) {
      upsertRecord(setChapters, data[0]);
      logAuditAction('INSERT', 'chapters', data[0].id, { name: data[0].name });
    }
    return { persisted: true };
  };

  const updateChapter = async (id, chapter) => {
    const payload = { ...chapter };
    const { data, error } = await supabase.from('chapters').update(payload).eq('id', id).select();
    if (error) throw error;
    if (data?.[0]) {
      upsertRecord(setChapters, data[0]);
      logAuditAction('UPDATE', 'chapters', id, { name: data[0].name });
    }
    return { persisted: true };
  };

  const deleteChapter = async (id) => {
    const { error } = await supabase.from('chapters').delete().eq('id', id);
    if (error) throw error;
    logAuditAction('DELETE', 'chapters', id);
    setChapters((current) => current.filter((chapter) => chapter.id !== id));
    return { persisted: true };
  };

  const addVolunteer = async (volunteer) => {
    const { data, error } = await supabase.from('volunteers').insert([volunteer]).select();
    if (error) throw error;
    if (data?.[0]) {
      upsertRecord(setVolunteersList, data[0]);
      logAuditAction('INSERT', 'volunteers', data[0].id, { name: data[0].name });
    }
    setStats(prev => ({ ...prev, volunteers: prev.volunteers + 1 }));
    return { persisted: true };
  };

  const updateVolunteer = async (id, volunteer) => {
    const { data, error } = await supabase.from('volunteers').update(volunteer).eq('id', id).select();
    if (error) throw error;
    if (data?.[0]) {
      upsertRecord(setVolunteersList, data[0]);
      logAuditAction('UPDATE', 'volunteers', id, { name: data[0].name });
    }
    return { persisted: true };
  };

  const deleteVolunteer = async (id) => {
    const { error } = await supabase.from('volunteers').delete().eq('id', id);
    if (error) throw error;
    setStats(prev => ({ ...prev, volunteers: Math.max(0, prev.volunteers - 1) }));
    logAuditAction('DELETE', 'volunteers', id);
    setVolunteersList((current) => current.filter((volunteer) => volunteer.id !== id));
    return { persisted: true };
  };

  const addInventoryItem = async (item) => {
    const { data, error } = await supabase.from('inventory').insert([item]).select();
    if (error) throw error;
    if (data?.[0]) {
      upsertRecord(setInventoryList, data[0]);
      logAuditAction('INSERT', 'inventory', data[0].id, { item: data[0].name });
    }
    return { persisted: true };
  };

  const updateInventoryItem = async (id, item) => {
    const { data, error } = await supabase.from('inventory').update(item).eq('id', id).select();
    if (error) throw error;
    if (data?.[0]) {
      upsertRecord(setInventoryList, data[0]);
      logAuditAction('UPDATE', 'inventory', id, { item: data[0].name });
    }
    return { persisted: true };
  };

  const deleteInventoryItem = async (id) => {
    const { error } = await supabase.from('inventory').delete().eq('id', id);
    if (error) throw error;
    logAuditAction('DELETE', 'inventory', id);
    setInventoryList((current) => current.filter((item) => item.id !== id));
    return { persisted: true };
  };

  const addSocialPost = async (post) => {
    const { data, error } = await supabase.from('social_media_posts').insert([post]).select();
    if (error) throw error;
    if (data?.[0]) {
      upsertRecord(setSocialPosts, data[0]);
      logAuditAction('INSERT', 'social_media_posts', data[0].id);
    }
    return { persisted: true };
  };

  const updateSocialPost = async (id, post) => {
    const { data, error } = await supabase.from('social_media_posts').update(post).eq('id', id).select();
    if (error) throw error;
    if (data?.[0]) {
      upsertRecord(setSocialPosts, data[0]);
      logAuditAction('UPDATE', 'social_media_posts', id);
    }
    return { persisted: true };
  };

  const deleteSocialPost = async (id) => {
    const { error } = await supabase.from('social_media_posts').delete().eq('id', id);
    if (error) throw error;
    logAuditAction('DELETE', 'social_media_posts', id);
    setSocialPosts((current) => current.filter((post) => post.id !== id));
    return { persisted: true };
  };

  const addEvent = async (event) => {
    const payload = buildEventFolderMetadata(event);
    const { data, error } = await supabase.from('events').insert([payload]).select();
    if (error) throw error;
    if (data?.[0]) {
      upsertRecord(setEventsList, data[0]);
      logAuditAction('INSERT', 'events', data[0].id, { title: data[0].title });
    }
    return { persisted: true };
  };

  const updateEvent = async (id, event) => {
    const payload = buildEventFolderMetadata(event);
    const { data, error } = await supabase.from('events').update(payload).eq('id', id).select();
    if (error) throw error;
    if (data?.[0]) {
      upsertRecord(setEventsList, data[0]);
      logAuditAction('UPDATE', 'events', id, { title: data[0].title });
    }
    return { persisted: true };
  };

  const deleteEvent = async (id) => {
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) throw error;
    logAuditAction('DELETE', 'events', id);
    setEventsList((current) => current.filter((event) => event.id !== id));
    return { persisted: true };
  };

  const addLearner = () => {
    setStats(prev => ({ ...prev, learnersReached: prev.learnersReached + 1 }));
  };

  const setThemeMode = (nextThemeMode) => {
    setThemeModeState(nextThemeMode === 'dark' ? 'dark' : 'light');
  };

  const toggleThemeMode = () => {
    setThemeModeState((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  const updateDashboardSetting = (field, value) => {
    setDashboardSettings((current) => ({ ...current, [field]: value }));
  };

  const resetDashboardSettings = () => {
    setDashboardSettings(defaultDashboardSettings);
  };

  return (
    <AppContext.Provider value={{
      stats,
      chapters,
      volunteersList,
      inventoryList,
      socialPosts,
      eventsList,
      growthData,
      authLoading,
      isAuthenticated,
      user,
      themeMode,
      setThemeMode,
      toggleThemeMode,
      dashboardSettings,
      updateDashboardSetting,
      resetDashboardSettings,
      role: user?.role || 'Visitor',
      roleKey: user?.roleKey || 'visitor',
      isPendingVolunteer: user?.roleKey === 'pending_volunteer',
      isSuperadmin: user?.roleKey === 'super_admin',
      isAdmin: user?.roleKey === 'super_admin' || user?.roleKey === 'admin',
      hasRole: (...roles) => roles.includes(user?.roleKey),
      canManageContent: user?.roleKey === 'super_admin' || user?.roleKey === 'admin',
      acceptSession,
      loginWithGoogle,
      logout,
      addChapter,
      updateChapter,
      deleteChapter,
      addVolunteer,
      updateVolunteer,
      deleteVolunteer,
      addInventoryItem,
      updateInventoryItem,
      deleteInventoryItem,
      addSocialPost,
      updateSocialPost,
      deleteSocialPost,
      addEvent,
      updateEvent,
      deleteEvent,
      addLearner
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);

