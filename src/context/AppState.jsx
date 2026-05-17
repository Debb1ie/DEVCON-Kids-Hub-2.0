import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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

const fallbackChapters = [
  { id: 1, name: 'Manila', learners: 2340, workshops: 38, completion: 95, color: '#8B5CF6' },
  { id: 2, name: 'Cebu', learners: 1820, workshops: 25, completion: 92, color: '#10B981' }
];

const fallbackEvents = [
  {
    id: 1,
    title: 'Hour of AI',
    type: 'Cycle Program',
    chapter: 'Manila',
    coordinator: 'Program Coordinators',
    event_date: '2026-06-15',
    description: 'Highlighted solution program for kids, coordinated by chapter leads for repeated cycle delivery.',
    image_url: '',
    status: 'Scheduled',
    google_folder_name: 'Hour of AI',
    google_folder_path: 'Google Drive/DEVCON Kids/Events/Hour of AI',
    google_assets_path: 'Google Drive/DEVCON Kids/Events/Hour of AI/Assets',
    google_folder_status: 'Ready for Google Drive sync'
  }
];

const normalizeFolderName = (value = '') =>
  value
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ');

const resolveRole = (email, userMetadata = {}) => {
  const metadataRole = (userMetadata.role || '').toLowerCase();
  const normalizedEmail = (email || '').toLowerCase();

  if (normalizedEmail === 'pmanucom@devcon.ph' || metadataRole === 'superadmin' || metadataRole === 'admin') {
    return 'Superadmin';
  }

  if (metadataRole === 'visitor') {
    return 'Visitor';
  }

  return 'Visitor';
};

const buildUserProfile = (sessionUser, fallbackRole = 'Visitor') => ({
  id: sessionUser.id,
  email: sessionUser.email,
  name: sessionUser.user_metadata?.name || sessionUser.user_metadata?.full_name || sessionUser.email,
  role: resolveRole(sessionUser.email, sessionUser.user_metadata) || fallbackRole
});

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
    if (data && data.length > 0) {
      setChapters(data);
      setStats((prev) => ({ ...prev, activeChapters: data.length }));
    }
  } catch (e) {
    console.warn("Using fallback chapters. Please run the SQL setup script.", e);
  }
};

const fetchVolunteers = async (supabase, setVolunteersList) => {
  try {
    const { data, error } = await supabase.from('volunteers').select('*');
    if (error) throw error;
    if (data) setVolunteersList(data);
  } catch (e) {
    console.warn("Using fallback volunteers.", e);
  }
};

const fetchInventory = async (supabase, setInventoryList) => {
  try {
    const { data, error } = await supabase.from('inventory').select('*');
    if (error) throw error;
    if (data) setInventoryList(data);
  } catch (e) {
    console.warn("Using fallback inventory.", e);
  }
};

const fetchSocialPosts = async (supabase, setSocialPosts) => {
  try {
    const { data, error } = await supabase.from('social_media_posts').select('*');
    if (error) throw error;
    if (data) setSocialPosts(data);
  } catch (e) {
    console.warn("Using fallback social posts.", e);
  }
};

const fetchEvents = async (supabase, setEventsList) => {
  try {
    const { data, error } = await supabase.from('events').select('*');
    if (error) throw error;
    if (data && data.length > 0) setEventsList(data);
  } catch (e) {
    console.warn('Using fallback events.', e);
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

  const [chapters, setChapters] = useState(fallbackChapters);
  const [volunteersList, setVolunteersList] = useState([]);
  const [inventoryList, setInventoryList] = useState([]);
  const [socialPosts, setSocialPosts] = useState([]);
  const [eventsList, setEventsList] = useState(fallbackEvents);

  const [growthData] = useState([
    { month: 'Jan', learners: 5000 },
    { month: 'Feb', learners: 6200 },
    { month: 'Mar', learners: 7800 },
    { month: 'Apr', learners: 9500 },
    { month: 'May', learners: 12450 }
  ]);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true); // eslint-disable-line no-unused-vars
  const [themeMode, setThemeModeState] = useState(getStoredThemeMode);
  const [dashboardSettings, setDashboardSettings] = useState(loadDashboardSettings);

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

// Fetch Data from Supabase
   useEffect(() => {
     fetchChapters(supabase, setChapters, setStats);
     fetchVolunteers(supabase, setVolunteersList);
     fetchInventory(supabase, setInventoryList);
     fetchSocialPosts(supabase, setSocialPosts);
     fetchEvents(supabase, setEventsList);
   }, []);

  // Sync Supabase auth session on mount and listen for changes
  useEffect(() => {
    let mounted = true;
    let pollTimer = null;
    const isOAuthCallback =
      typeof window !== 'undefined' && window.location.pathname === '/auth/callback';

    if (isOAuthCallback) {
      console.debug('[Auth] /auth/callback route detected — will poll getSession() for OAuth code exchange');
    }

    const finishLoading = () => {
      if (mounted) setAuthLoading(false);
      console.debug('[Auth] authLoading -> false, isAuthenticated =', isAuthenticated);
    };

    // Fast-path: if polling already stored the session in sessionStorage,
    // restore state immediately without waiting for getSession().
    const { storedSession } = (() => {
      try { return JSON.parse(sessionStorage.getItem('auth_session') || '{}'); }
      catch { return {}; }
    })();
    if (storedSession?.user) {
      if (mounted) {
        setIsAuthenticated(true);
        setUser(buildUserProfile(storedSession.user));
        sessionStorage.removeItem('auth_session');
      }
      finishLoading();
    }

    const syncSession = async () => {
      try {
        console.log('[Auth] Calling getSession()...');
        const { data, error } = await supabase.auth.getSession();
        const session = data?.session;
        if (error) {
          console.warn('[Auth] getSession() error:', error);
        } else {
          console.log('[Auth] getSession() returned:', session ? `user ${session.user.email}` : 'null');
        }
        if (session?.user && mounted) {
          console.log('[Auth] Sync: Session found from getSession()');
          setIsAuthenticated(true);
          setUser(buildUserProfile(session.user));
          // Mirror into sessionStorage so AuthCallback has a fast-path on remount
          try { sessionStorage.setItem('auth_session', JSON.stringify({ user: session.user })); } catch {}
          finishLoading();
          return;
        }
        if (isOAuthCallback) {
          console.log('[Auth] On /auth/callback but no session yet — starting poll');
        }
      } catch (e) {
        console.warn('[Auth] getSession() failed immediately:', e);
      }

      // If we're on /auth/callback and getSession() returned null,
      // the PKCE code may not have been exchanged yet — poll until we know.
      if (isOAuthCallback) {
        const setIntervalFn = typeof self !== 'undefined' ? self.setInterval : (typeof setInterval !== 'undefined' ? setInterval : undefined);
        const clearIntervalFn = typeof self !== 'undefined' ? self.clearInterval : (typeof clearInterval !== 'undefined' ? clearInterval : undefined);
        const clearTimeoutFn = typeof window !== 'undefined' && window.clearTimeout ? window.clearTimeout : (typeof clearTimeout !== 'undefined' ? clearTimeout : undefined);
        if (!setIntervalFn) {
          finishLoading();
          return;
        }
        console.log('[Auth] Starting OAuth session poll every 500ms...');
        let pollAttempts = 0;
        pollTimer = setIntervalFn(async () => {
          if (!mounted) {
            if (pollTimer !== null && clearIntervalFn) clearIntervalFn(pollTimer);
            pollTimer = null;
            return;
          }
          try {
            const { data } = await supabase.auth.getSession();
            const session = data?.session;
            if (session?.user) {
              console.log('[Auth] Poll: Session found after', pollAttempts * 500, 'ms');
              setIsAuthenticated(true);
              setUser(buildUserProfile(session.user));
              try { sessionStorage.setItem('auth_session', JSON.stringify({ user: session.user })); } catch {}
              if (pollTimer !== null && clearIntervalFn) clearIntervalFn(pollTimer);
              pollTimer = null;
              finishLoading();
            } else {
              pollAttempts++;
              if (pollAttempts % 6 === 0) {
                console.log('[Auth] Poll attempt', pollAttempts, '— still waiting for session (', pollAttempts * 500, 'ms)...');
              }
            }
          } catch (e) {
            console.warn('[Auth] Poll attempt error:', e);
          }
        }, 500);
      } else {
        // Not on /auth/callback - only finish loading if we actually found a session or confirmed no session
        console.log('[Auth] Not on /auth/callback route, will rely on onAuthStateChange to determine auth state');
      }
    };

    // On /auth/callback, add a delay before syncing to let Supabase parse the OAuth URL
    if (isOAuthCallback) {
      console.log('[Auth] On /auth/callback — delaying sync by 800ms to allow Supabase to parse OAuth parameters');
      setTimeout(syncSession, 800);
    } else {
      syncSession();
    }

    // Fallback only after 60 seconds (removed the 20s timeout)
    const callbackFallbackTimer = window.setTimeout(() => {
      console.warn('[Auth] Extended poll fallback timer fired — no session after 60 s. Stopping poll. URL:', window.location.href);
      if (pollTimer) {
        if (typeof self !== 'undefined') self.clearInterval(pollTimer);
        else clearInterval(pollTimer);
        pollTimer = null;
      }
      // Only finish loading if we're not on /auth/callback (user will be redirected to dashboard anyway)
      if (!isOAuthCallback) {
        finishLoading();
      }
    }, 60_000);

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        console.log('[Auth] onAuthStateChange event:', _event, 'user:', session?.user?.email ?? 'signed-out');
        if (pollTimer) {
          if (typeof self !== 'undefined') self.clearInterval(pollTimer);
          else clearInterval(pollTimer);
          pollTimer = null;
        }
        if (session?.user) {
          console.log('[Auth] Setting authenticated state for user:', session.user.email);
          setIsAuthenticated(true);
          setUser(buildUserProfile(session.user));
          try { sessionStorage.setItem('auth_session', JSON.stringify({ user: session.user })); } catch {}
        } else {
          console.log('[Auth] Clearing authenticated state');
          setIsAuthenticated(false);
          setUser(null);
        }
        finishLoading();
      }
    );

    return () => {
      mounted = false;
      window.clearTimeout(callbackFallbackTimer);
      if (pollTimer) {
        if (typeof self !== 'undefined') self.clearInterval(pollTimer);
        else clearInterval(pollTimer);
        pollTimer = null;
      }
      if (listener && listener.subscription) listener.subscription.unsubscribe();
    };
  }, []);

  // Auth Actions
  const login = (email, password) => {
    if (email === 'pmanucom@devcon.ph' && password === 'devconkids101') {
      setIsAuthenticated(true);
      setUser({ email, name: 'Admin User', role: 'Superadmin' });
      return { success: true };
    }
    return { success: false, message: 'Invalid credentials. Please use pmanucom@devcon.ph / devconkids101' };
  };

  const loginWithGoogle = async () => {
    try {
      const redirectUrl = window.location.origin + '/auth/callback';
      console.log('🟡 [AppState.loginWithGoogle] Initiating Google OAuth with redirectTo:', redirectUrl);
      
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
      
      if (error) {
        console.error('🟡 [AppState.loginWithGoogle] OAuth error from Supabase:', error);
        throw error;
      }
      
      if (data?.url) {
        console.log('🟡 [AppState.loginWithGoogle] Received redirect URL from Supabase:', data.url);
        console.log('🟡 [AppState.loginWithGoogle] About to redirect to Google...');
        if (typeof window !== 'undefined') {
          window.location.href = data.url;
          return { success: true, redirectUrl: data.url };
        }
      } else {
        console.log('🟡 [AppState.loginWithGoogle] No URL in response, but no error either');
      }
      
      return { success: true, data };
    } catch (error) {
      console.error('🟡 [AppState.loginWithGoogle] Exception caught:', error.message, error);
      return { success: false, error };
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
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
  const addChapter = async (chapter) => {
    const payload = { ...chapter };

    try {
      const { data, error } = await supabase.from('chapters').insert([payload]).select();
      if (error) throw error;
      if (data?.[0]) {
        upsertRecord(setChapters, data[0]);
      }
    } catch (error) {
      const mockNew = { id: Date.now(), ...payload };
      upsertRecord(setChapters, mockNew);
    }
  };

  const updateChapter = async (id, chapter) => {
    const payload = { ...chapter };

    try {
      const { data, error } = await supabase.from('chapters').update(payload).eq('id', id).select();
      if (error) throw error;
      if (data?.[0]) {
        upsertRecord(setChapters, data[0]);
      }
    } catch (error) {
      upsertRecord(setChapters, { id, ...payload });
    }
  };

  const deleteChapter = async (id) => {
    try {
      await supabase.from('chapters').delete().eq('id', id);
    } catch (error) {
      console.warn('Falling back to local chapter delete.', error);
    } finally {
      setChapters((current) => current.filter((chapter) => chapter.id !== id));
    }
  };

  const addVolunteer = async (volunteer) => {
    try {
      const { data, error } = await supabase.from('volunteers').insert([volunteer]).select();
      if (error) throw error;
      if (data?.[0]) upsertRecord(setVolunteersList, data[0]);
      setStats(prev => ({ ...prev, volunteers: prev.volunteers + 1 }));
    } catch (error) {
      // Fallback local update if Supabase fails
      const mockNew = { id: Date.now(), ...volunteer };
      upsertRecord(setVolunteersList, mockNew);
      setStats(prev => ({ ...prev, volunteers: prev.volunteers + 1 }));
    }
  };

  const updateVolunteer = async (id, volunteer) => {
    try {
      const { data, error } = await supabase.from('volunteers').update(volunteer).eq('id', id).select();
      if (error) throw error;
      if (data?.[0]) {
        upsertRecord(setVolunteersList, data[0]);
      }
    } catch (error) {
      upsertRecord(setVolunteersList, { id, ...volunteer });
    }
  };

  const deleteVolunteer = async (id) => {
    try {
      await supabase.from('volunteers').delete().eq('id', id);
      setStats(prev => ({ ...prev, volunteers: Math.max(0, prev.volunteers - 1) }));
    } catch (error) {
      console.warn('Falling back to local volunteer delete.', error);
    }
    setVolunteersList((current) => current.filter((volunteer) => volunteer.id !== id));
  };

  const addInventoryItem = async (item) => {
    try {
      const { data, error } = await supabase.from('inventory').insert([item]).select();
      if (error) throw error;
      if (data?.[0]) upsertRecord(setInventoryList, data[0]);
    } catch (error) {
      const mockNew = { id: Date.now(), ...item };
      upsertRecord(setInventoryList, mockNew);
    }
  };

  const updateInventoryItem = async (id, item) => {
    try {
      const { data, error } = await supabase.from('inventory').update(item).eq('id', id).select();
      if (error) throw error;
      if (data?.[0]) {
        upsertRecord(setInventoryList, data[0]);
      }
    } catch (error) {
      upsertRecord(setInventoryList, { id, ...item });
    }
  };

  const deleteInventoryItem = async (id) => {
    try {
      await supabase.from('inventory').delete().eq('id', id);
    } catch (error) {
      console.warn('Falling back to local inventory delete.', error);
    }
    setInventoryList((current) => current.filter((item) => item.id !== id));
  };

  const addSocialPost = async (post) => {
    try {
      const { data, error } = await supabase.from('social_media_posts').insert([post]).select();
      if (error) throw error;
      if (data?.[0]) upsertRecord(setSocialPosts, data[0]);
    } catch (error) {
      const mockNew = { id: Date.now(), ...post };
      upsertRecord(setSocialPosts, mockNew);
    }
  };

  const updateSocialPost = async (id, post) => {
    try {
      const { data, error } = await supabase.from('social_media_posts').update(post).eq('id', id).select();
      if (error) throw error;
      if (data?.[0]) {
        upsertRecord(setSocialPosts, data[0]);
      }
    } catch (error) {
      upsertRecord(setSocialPosts, { id, ...post });
    }
  };

  const deleteSocialPost = async (id) => {
    try {
      await supabase.from('social_media_posts').delete().eq('id', id);
    } catch (error) {
      console.warn('Falling back to local post delete.', error);
    }
    setSocialPosts((current) => current.filter((post) => post.id !== id));
  };

  const addEvent = async (event) => {
    const payload = buildEventFolderMetadata(event);

    try {
      const { data, error } = await supabase.from('events').insert([payload]).select();
      if (error) throw error;
      if (data?.[0]) upsertRecord(setEventsList, data[0]);
    } catch (error) {
      const mockNew = { id: Date.now(), ...payload };
      upsertRecord(setEventsList, mockNew);
    }
  };

  const updateEvent = async (id, event) => {
    const payload = buildEventFolderMetadata(event);

    try {
      const { data, error } = await supabase.from('events').update(payload).eq('id', id).select();
      if (error) throw error;
      if (data?.[0]) upsertRecord(setEventsList, data[0]);
    } catch (error) {
      upsertRecord(setEventsList, { id, ...payload });
    }
  };

  const deleteEvent = async (id) => {
    try {
      await supabase.from('events').delete().eq('id', id);
    } catch (error) {
      console.warn('Falling back to local event delete.', error);
    }
    setEventsList((current) => current.filter((event) => event.id !== id));
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
      isSuperadmin: (user?.role || '').toLowerCase() === 'superadmin',
      canManageContent: (user?.role || '').toLowerCase() === 'superadmin',
      login,
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

