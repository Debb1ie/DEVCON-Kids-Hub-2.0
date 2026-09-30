import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { MoreHorizontal, Search, Trash2, Users } from 'lucide-react';
import ConfirmationModal from '../components/ConfirmationModal';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { useApp } from '../context/AppState';
import {
  assignableRolesFor,
  getManagedUserAccess,
  getRowSaveState,
  managedUserName,
  runUserDeletion,
} from '../auth/userManagementRules';
import { changeManagedUserRole, deleteManagedUser, listAssignableLocations, listManagedUsers, USER_ROLES } from '../services/userManagementService';
import './UserManagement.css';

const label = (value) => value?.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ') || 'Pending Volunteer';

export default function UserManagement() {
  const { roleKey, user } = useApp();
  const [users, setUsers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [chapterFilter, setChapterFilter] = useState('all');
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [managedUsers, assignableLocations] = await Promise.all([
        listManagedUsers(),
        listAssignableLocations(),
      ]);
      setUsers(managedUsers);
      setLocations(assignableLocations);
    } catch {
      setError('Unable to load the user and location directories.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const task = window.setTimeout(load, 0);
    return () => window.clearTimeout(task);
  }, [load]);

  const filtered = useMemo(
    () =>
      users.filter((item) => {
        const query = search.trim().toLowerCase();
        return (
          (!query ||
            item.full_name?.toLowerCase().includes(query) ||
            item.email?.toLowerCase().includes(query)) &&
          (roleFilter === 'all' || item.role === roleFilter) &&
          (chapterFilter === 'all' || item.chapter_id === chapterFilter)
        );
      }),
    [users, search, roleFilter, chapterFilter]
  );

  const allowedRoles = assignableRolesFor(roleKey);
  const superAdminCount = users.filter((item) => item.role === 'super_admin').length;

  const propose = (item, nextRole, chapterId, locationName) =>
    setPending({ item, role: nextRole, chapterId, locationName });

  const confirm = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await changeManagedUserRole(
        pending.item.user_id,
        pending.role,
        pending.chapterId,
        locations
      );
      setNotice(
        `${pending.item.full_name || pending.item.email} is now ${label(
          pending.role
        )}.`
      );
      setPending(null);
      await load();
    } catch (cause) {
      setError(cause?.message || 'The role could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    setError('');
    setNotice('');
    const result = await runUserDeletion({ users, target: deleting, remove: deleteManagedUser });
    setUsers(result.users);
    if (result.ok) setNotice(result.message);
    else setError(result.message);
    setDeleting(null);
    setDeleteBusy(false);
  };

  return (
    <div className="user-management-page">
      <PageHeader
        eyebrow="Administration"
        title="User Management"
        description="Approve access and manage role and chapter assignments."
      />

      {notice && (
        <div className="um-alert success" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="um-alert error" role="alert">
          {error}
        </div>
      )}

      <section className="um-filters card" aria-label="User filters">
        <label className="um-search">
          <Search size={18} />
          <span className="sr-only">Search users</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email"
          />
        </label>
        <select
          aria-label="Filter by role"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="all">All roles</option>
          {USER_ROLES.map((role) => (
            <option key={role} value={role}>
              {label(role)}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by location"
          value={chapterFilter}
          onChange={(e) => setChapterFilter(e.target.value)}
          disabled={loading}
        >
          <option value="all">All locations</option>
          <LocationOptions locations={locations} />
        </select>
      </section>

      {loading ? (
        <div className="um-state" role="status">
          Loading users…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users found"
          description="Try adjusting your search query or role/location filters."
        />
      ) : (
        <div className="um-list">
          {filtered.map((item) => (
            <UserRow
              key={`${item.user_id}:${item.role}:${item.chapter_id || ''}`}
              item={item}
              locations={locations}
              roles={allowedRoles}
              access={getManagedUserAccess({
                actorRole: roleKey,
                actorId: user?.id,
                actorEmail: user?.email,
                target: item,
                superAdminCount,
              })}
              saving={busy && pending?.item.user_id === item.user_id}
              onPropose={propose}
              onDelete={setDeleting}
            />
          ))}
        </div>
      )}

      {pending && (
        <ConfirmationModal
          title="Confirm role change"
          message={`Change ${pending.item.full_name || pending.item.email} from ${label(
            pending.item.role
          )} to ${label(pending.role)}${
            pending.locationName ? ` at ${pending.locationName}` : ''
          }?`}
          confirmLabel="Update role"
          busyLabel="Updating…"
          onCancel={() => setPending(null)}
          onConfirm={confirm}
          isBusy={busy}
          tone="primary"
        />
      )}

      {deleting && (
        <ConfirmationModal
          title="Delete user?"
          message={`This will permanently remove ${managedUserName(
            deleting
          )} from DEVCON Kids Hub. This action cannot be undone.`}
          confirmLabel="Delete user"
          busyLabel="Deleting…"
          cancelLabel="Cancel"
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
          isBusy={deleteBusy}
          tone="danger"
        />
      )}
    </div>
  );
}

function LocationOptions({ locations }) {
  const chapters = locations.filter((item) => item.location_type === 'chapter');
  const communities = locations.filter(
    (item) => item.location_type === 'volunteer_community'
  );
  return (
    <>
      <optgroup label="Chapters">
        {chapters.map((item) => (
          <option key={item.location_id} value={item.location_id}>
            {item.display_name}
          </option>
        ))}
      </optgroup>
      <optgroup label="Volunteer Communities">
        {communities.map((item) => (
          <option key={item.location_id} value={item.location_id}>
            {item.display_name}
          </option>
        ))}
      </optgroup>
    </>
  );
}

function RowMenu({ item, access, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.type === 'keydown' ? event.key === 'Escape' : !ref.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="um-menu" ref={ref}>
      <button
        type="button"
        className="um-menu-trigger"
        aria-label={`More actions for ${managedUserName(item)}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className="um-menu-list" role="menu" id={menuId}>
          <button
            type="button"
            role="menuitem"
            className="um-menu-item danger"
            disabled={!access.canDelete}
            onClick={() => {
              setOpen(false);
              onDelete(item);
            }}
          >
            <Trash2 size={16} />
            Delete user
          </button>
          {!access.canDelete && access.reason && (
            <p className="um-menu-note">{access.reason}</p>
          )}
        </div>
      )}
    </div>
  );
}

function UserRow({ item, locations, roles, access, saving, onPropose, onDelete }) {
  const [role, setRole] = useState(item.role);
  const [chapterId, setChapterId] = useState(item.chapter_id || '');
  const hintId = useId();
  const { canEdit } = access;
  const roleOptions = canEdit && roles.includes(item.role) ? roles : [item.role];
  const state = getRowSaveState({ original: item, role, chapterId, locations, canEdit, saving });
  const selectedLocation = locations.find(
    (location) => location.location_id === chapterId && location.is_active
  );

  const changeRole = (nextRole) => {
    setRole(nextRole);
    if (!getRowSaveState({ original: item, role: nextRole, chapterId, locations }).requiresLocation) setChapterId('');
  };

  return (
    <article className={`um-user card${canEdit ? '' : ' is-readonly'}`}>
      <div className="um-identity">
        <div className="um-avatar">
          {(item.full_name || item.email || '?')[0].toUpperCase()}
        </div>
        <div>
          <strong>{item.full_name || 'Unnamed user'}</strong>
          <span>{item.email}</span>
        </div>
      </div>
      <div className="um-current">
        <span className={`um-badge ${item.role}`}>{label(item.role)}</span>
        <small>{item.chapter_name || 'No chapter'}</small>
      </div>
      <label>
        <span>Role</span>
        <select
          value={role}
          disabled={!canEdit || saving}
          onChange={(e) => changeRole(e.target.value)}
        >
          {roleOptions.map((value) => (
            <option key={value} value={value}>
              {label(value)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>
          Location{state.requiresLocation && canEdit ? <em className="um-required"> (required)</em> : null}
        </span>
        <select
          value={chapterId}
          disabled={!canEdit || saving || !state.requiresLocation}
          aria-invalid={Boolean(state.hint) || undefined}
          aria-describedby={state.hint ? hintId : undefined}
          onChange={(e) => setChapterId(e.target.value)}
        >
          <option value="">Select location</option>
          <LocationOptions locations={locations} />
        </select>
      </label>
      <div className="um-actions">
        <button
          type="button"
          className="btn-primary um-save"
          disabled={state.disabled}
          onClick={() =>
            onPropose(item, role, state.requiresLocation ? chapterId : '', selectedLocation?.display_name)
          }
        >
          {saving ? 'Saving…' : item.role === 'pending_volunteer' ? 'Approve' : 'Save'}
        </button>
        {!access.isSelf && <RowMenu item={item} access={access} onDelete={onDelete} />}
      </div>
      {state.hint && (
        <small id={hintId} className="um-hint" role="status">
          {state.hint}
        </small>
      )}
      {!canEdit && access.reason && <small className="um-self">{access.reason}</small>}
    </article>
  );
}
