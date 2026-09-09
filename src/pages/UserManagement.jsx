import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, ShieldCheck, Users } from 'lucide-react';
import ConfirmationModal from '../components/ConfirmationModal';
import { useApp } from '../context/AppState';
import { CHAPTER_ROLES } from '../auth/userManagementRules';
import { changeManagedUserRole, listManagedUsers, USER_ROLES } from '../services/userManagementService';
import './UserManagement.css';

const label = (value) => value?.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ') || 'Pending Volunteer';
const needsChapter = (role) => CHAPTER_ROLES.includes(role);

export default function UserManagement() {
  const { chapters, roleKey, user } = useApp();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [chapterFilter, setChapterFilter] = useState('all');
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setUsers(await listManagedUsers()); }
    catch { setError('Unable to load users. The approved User Management database migration may not be deployed yet.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const task = window.setTimeout(load, 0);
    return () => window.clearTimeout(task);
  }, [load]);

  const filtered = useMemo(() => users.filter((item) => {
    const query = search.trim().toLowerCase();
    return (!query || item.full_name?.toLowerCase().includes(query) || item.email?.toLowerCase().includes(query))
      && (roleFilter === 'all' || item.role === roleFilter)
      && (chapterFilter === 'all' || item.chapter_id === chapterFilter);
  }), [users, search, roleFilter, chapterFilter]);

  const allowedRoles = roleKey === 'super_admin' ? USER_ROLES : USER_ROLES.filter((role) => !['admin', 'super_admin'].includes(role));
  const propose = (item, nextRole, chapterId) => setPending({ item, role: nextRole, chapterId });
  const confirm = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      await changeManagedUserRole(pending.item.user_id, pending.role, pending.chapterId);
      setNotice(`${pending.item.full_name || pending.item.email} is now ${label(pending.role)}.`);
      setPending(null); await load();
    } catch (cause) { setError(cause?.message || 'The role could not be updated.'); }
    finally { setBusy(false); }
  };

  return <div className="user-management-page">
    <header className="um-header"><div><p className="um-eyebrow"><ShieldCheck size={16}/> Administration</p><h1>User Management</h1><p>Approve access and manage role and chapter assignments.</p></div></header>
    {notice && <div className="um-alert success" role="status">{notice}</div>}
    {error && <div className="um-alert error" role="alert">{error}</div>}
    <section className="um-filters card" aria-label="User filters">
      <label className="um-search"><Search size={18}/><span className="sr-only">Search users</span><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search by name or email"/></label>
      <select aria-label="Filter by role" value={roleFilter} onChange={(e)=>setRoleFilter(e.target.value)}><option value="all">All roles</option>{USER_ROLES.map((role)=><option key={role} value={role}>{label(role)}</option>)}</select>
      <select aria-label="Filter by chapter" value={chapterFilter} onChange={(e)=>setChapterFilter(e.target.value)}><option value="all">All chapters</option>{chapters.map((chapter)=><option key={chapter.id} value={chapter.id}>{chapter.name}</option>)}</select>
    </section>
    {loading ? <div className="um-state" role="status">Loading users…</div> : filtered.length === 0 ? <div className="um-state"><Users size={32}/><h2>No users found</h2><p>Try changing the filters.</p></div> : <div className="um-list">
      {filtered.map((item)=><UserRow key={item.user_id} item={item} chapters={chapters} roles={allowedRoles} currentUserEmail={user?.email} onPropose={propose}/>) }
    </div>}
    {pending && (
      <ConfirmationModal
        title="Confirm role change"
        message={`Change ${pending.item.full_name || pending.item.email} from ${label(pending.item.role)} to ${label(pending.role)}?`}
        confirmLabel="Update role"
        busyLabel="Updating…"
        onCancel={() => setPending(null)}
        onConfirm={confirm}
        isBusy={busy}
      />
    )}
  </div>;
}

function UserRow({ item, chapters, roles, currentUserEmail, onPropose }) {
  const [role, setRole] = useState(item.role);
  const [chapterId, setChapterId] = useState(item.chapter_id || '');
  const isSelf = item.email?.toLowerCase() === currentUserEmail?.toLowerCase();
  const changed = role !== item.role || (needsChapter(role) && chapterId !== (item.chapter_id || ''));
  return <article className="um-user card">
    <div className="um-identity"><div className="um-avatar">{(item.full_name || item.email || '?')[0].toUpperCase()}</div><div><strong>{item.full_name || 'Unnamed user'}</strong><span>{item.email}</span></div></div>
    <div className="um-current"><span className={`um-badge ${item.role}`}>{label(item.role)}</span><small>{item.chapter_name || 'No chapter'}</small></div>
    <label><span>Role</span><select value={role} disabled={isSelf} onChange={(e)=>setRole(e.target.value)}>{roles.map((value)=><option key={value} value={value}>{label(value)}</option>)}</select></label>
    <label><span>Chapter</span><select value={chapterId} disabled={isSelf || !needsChapter(role)} onChange={(e)=>setChapterId(e.target.value)}><option value="">Select chapter</option>{chapters.map((chapter)=><option key={chapter.id} value={chapter.id}>{chapter.name}</option>)}</select></label>
    <button type="button" className="btn-primary" disabled={isSelf || !changed || (needsChapter(role) && !chapterId)} onClick={()=>onPropose(item, role, chapterId)}>{item.role === 'pending_volunteer' ? 'Approve' : 'Save'}</button>
    {isSelf && <small className="um-self">Your own assignment is read-only.</small>}
  </article>;
}
