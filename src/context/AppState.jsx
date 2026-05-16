import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AppContext = createContext();

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

export const AppProvider = ({ children }) => {
  const [stats, setStats] = useState({
    learnersReached: 12450,
    successfulWorkshops: 142,
    activeChapters: 11,
    volunteers: 850
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

  // Fetch Data from Supabase
  useEffect(() => {
    fetchChapters();
    fetchVolunteers();
    fetchInventory();
    fetchSocialPosts();
    fetchEvents();
  }, []);

  const fetchChapters = async () => {
    try {
      const { data, error } = await supabase.from('chapters').select('*');
      if (error) throw error;
      if (data && data.length > 0) {
        setChapters(data);
        setStats((prev) => ({ ...prev, activeChapters: data.length }));
      }
    } catch (error) {
      console.warn("Using fallback chapters. Please run the SQL setup script.", error);
    }
  };

  const fetchVolunteers = async () => {
    try {
      const { data, error } = await supabase.from('volunteers').select('*');
      if (error) throw error;
      if (data) setVolunteersList(data);
    } catch (error) {
      console.warn("Using fallback volunteers.", error);
    }
  };

  const fetchInventory = async () => {
    try {
      const { data, error } = await supabase.from('inventory').select('*');
      if (error) throw error;
      if (data) setInventoryList(data);
    } catch (error) {
      console.warn("Using fallback inventory.", error);
    }
  };

  const fetchSocialPosts = async () => {
    try {
      const { data, error } = await supabase.from('social_media_posts').select('*');
      if (error) throw error;
      if (data) setSocialPosts(data);
    } catch (error) {
      console.warn("Using fallback social posts.", error);
    }
  };

  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase.from('events').select('*');
      if (error) throw error;
      if (data && data.length > 0) setEventsList(data);
    } catch (error) {
      console.warn('Using fallback events.', error);
    }
  };

  // Auth Actions
  const login = (email, password) => {
    if (email === 'pmanucom@devcon.ph' && password === 'devconkids101') {
      setIsAuthenticated(true);
      setUser({ email, name: 'Admin User', role: 'Superadmin' });
      return { success: true };
    }
    return { success: false, message: 'Invalid credentials. Please use pmanucom@devcon.ph / devconkids101' };
  };

  const loginWithGoogle = () => {
    setIsAuthenticated(true);
    setUser({ email: 'pmanucom@devcon.ph', name: 'Admin User', role: 'Superadmin' });
    return { success: true };
  };

  const logout = () => {
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

  return (
    <AppContext.Provider value={{
      stats,
      chapters,
      volunteersList,
      inventoryList,
      socialPosts,
      eventsList,
      growthData,
      isAuthenticated,
      user,
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
