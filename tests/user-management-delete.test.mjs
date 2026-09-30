import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DELETE_ERRORS, handleDeleteUser } from '../supabase/functions/admin-delete-user/core.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const page = read('src/pages/UserManagement.jsx');
const service = read('src/services/userManagementService.js');
const migration = read('supabase/migrations/20260930000100_user_management_delete_user.sql');
const edge = read('supabase/functions/admin-delete-user/index.ts');
const target = '11111111-1111-4111-8111-111111111111';
const caller = '22222222-2222-4222-8222-222222222222';

const run = (overrides = {}) => {
  const calls = { deleted: [], audited: [] };
  const deps = {
    callerId: caller,
    body: { target_user_id: target },
    authorize: async () => ({ data: [{ deleted_user_id: target, deleted_email: 'v@example.org', deleted_role: 'volunteer' }], error: null }),
    deleteAuthUser: async (id) => { calls.deleted.push(id); return { error: null }; },
    audit: async (row) => { calls.audited.push(row); return { error: null }; },
    ...overrides,
  };
  return handleDeleteUser(deps).then((result) => ({ result, calls }));
};

test('12. Deletion requires an explicit confirmation modal with the approved copy', () => {
  assert.match(page, /title="Delete user\?"/);
  assert.match(page, /This will permanently remove \$\{managedUserName\(\s*deleting\s*\)\} from DEVCON Kids Hub\. This action cannot be undone\./);
  assert.match(page, /confirmLabel="Delete user"/);
  assert.match(page, /cancelLabel="Cancel"/);
  assert.match(page, /isBusy=\{deleteBusy\}/);
  assert.match(page, /onClick=\{\(\) => \{\s*setOpen\(false\);\s*onDelete\(item\);/, 'the menu item only opens the modal');
  assert.match(page, /role="menuitem"[\s\S]*?disabled=\{!access\.canDelete\}/);
});

test('15a. The database authorizes deletions for the calling actor', () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /auth\.uid\(\) is null/);
  assert.match(migration, /target_user_id = auth\.uid\(\)[\s\S]*own account/);
  assert.match(migration, /actor_role = 'admin' and target_role in \('super_admin', 'admin'\)/);
  assert.match(migration, /final Super Admin cannot be deleted/);
  assert.match(migration, /revoke all on function public\.admin_authorize_user_deletion\(uuid\) from public, anon/);
});

test('15b. The Edge Function authorizes with the caller JWT before using the service role', () => {
  assert.match(edge, /userClient\.rpc\('admin_authorize_user_deletion'/);
  assert.match(edge, /server\.auth\.admin\.deleteUser/);
  assert.doesNotMatch(service, /SERVICE_ROLE|service_role/i, 'the browser never sees the service role');
  assert.match(service, /functions\.invoke\('admin-delete-user'/);
});

test('15c. A database refusal stops the deletion (Admin deleting a Super Admin)', async () => {
  const { result, calls } = await run({ authorize: async () => ({ data: null, error: { code: '42501', message: 'Only a Super Admin can delete administrative accounts' } }) });
  assert.equal(result.status, 403);
  assert.equal(result.body.error, DELETE_ERRORS.protectedAdmin);
  assert.deepEqual(calls.deleted, []);
});

test('15d. Self deletion is refused before any database call', async () => {
  let authorized = false;
  const { result, calls } = await run({ body: { target_user_id: caller }, authorize: async () => { authorized = true; return {}; } });
  assert.equal(result.status, 403);
  assert.equal(authorized, false);
  assert.deepEqual(calls.deleted, []);
});

test('Invalid targets are rejected', async () => {
  const { result } = await run({ body: { target_user_id: 'not-a-uuid' } });
  assert.equal(result.status, 400);
});

test('Authorized deletion is audited before and after removing the auth user', async () => {
  const { result, calls } = await run();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { deleted: true, user_id: target });
  assert.deepEqual(calls.deleted, [target]);
  assert.deepEqual(calls.audited.map((row) => row.action), ['USER_DELETE_REQUESTED', 'USER_DELETED']);
  assert.equal(calls.audited[0].actor_id, caller);
});

test('Linked records make deletion fail cleanly with guidance', async () => {
  const { result } = await run({ deleteAuthUser: async () => ({ error: { status: 500, message: 'Database error deleting user' } }) });
  assert.equal(result.status, 409);
  assert.equal(result.body.error, DELETE_ERRORS.linked);
});

test('If the audit trail cannot be written, nothing is deleted', async () => {
  const { result, calls } = await run({ audit: async () => { throw new Error('audit down'); } });
  assert.equal(result.status, 503);
  assert.deepEqual(calls.deleted, []);
});

test('A completion audit failure never reports a finished deletion as failed', async () => {
  let n = 0;
  const { result } = await run({ audit: async () => { n += 1; return n === 1 ? { error: null } : { error: { message: 'down' } }; } });
  assert.equal(result.status, 200);
});

test('Linked records are rejected clearly and audited as a failed attempt', async () => {
  const audited = [];
  const { result, calls } = await run({
    deleteAuthUser: async () => ({ error: { status: 500, message: 'Database error deleting user' } }),
    audit: async (row) => { audited.push(row.action); return { error: null }; },
  });
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'LINKED_RECORDS');
  assert.deepEqual(audited, ['USER_DELETE_REQUESTED', 'USER_DELETE_FAILED']);
});

test('A concurrent final Super Admin refusal is reported as such, not as linked records', async () => {
  let checks = 0;
  const { result } = await run({
    authorize: async () => {
      checks += 1;
      return checks === 1
        ? { data: [{ deleted_user_id: target, deleted_role: 'super_admin' }], error: null }
        : { data: null, error: { code: '42501', message: 'The final Super Admin cannot be deleted' } };
    },
    deleteAuthUser: async () => ({ error: { status: 500, message: 'Database error deleting user' } }),
  });
  assert.equal(result.status, 409);
  assert.equal(result.body.error, DELETE_ERRORS.finalSuperAdmin);
});

test('Final Super Admin protection is an atomic database trigger, not count-then-delete in app code', () => {
  assert.match(migration, /create trigger guard_final_super_admin_trigger\s+before update of role or delete on public\.user_roles/);
  assert.match(migration, /guard_final_super_admin\(\)[\s\S]*pg_advisory_xact_lock\(hashtext\('devcon_user_role_management'\)\)[\s\S]*The final Super Admin cannot be removed/);
  assert.match(migration, /create or replace function public\.admin_authorize_user_deletion/);
  assert.match(migration, /drop trigger if exists guard_final_super_admin_trigger/);
  assert.match(readFileSync(new URL('./sql-guards-local-e2e.mjs', import.meta.url), 'utf8'), /Concurrent removal of both Super Admins: exactly one succeeds/);
});

test('Rows remount after a save so dirty state resets', () => {
  assert.match(page, /key=\{`\$\{item\.user_id\}:\$\{item\.role\}:\$\{item\.chapter_id \|\| ''\}`\}/);
});

test('Read-only rows only show their current role', () => {
  assert.match(page, /const roleOptions = canEdit && roles\.includes\(item\.role\) \? roles : \[item\.role\]/);
});

test('Danger confirm button keeps AA contrast in Daylight and Moonlight', () => {
  const tokens = read('src/styles/tokens.css');
  const lum = (hex) => {
    const [r, g, b] = hex.match(/\w\w/g).map((v) => parseInt(v, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const fills = [...tokens.matchAll(/--danger-fill(?:-hover)?: (#[0-9a-f]{6});/gi)].map((m) => m[1]);
  assert.equal(fills.length, 4);
  for (const fill of fills) assert.ok(ratio('#ffffff', fill) >= 4.5, `${fill} vs white`);
  assert.match(read('src/components/ConfirmationModal.css'), /background: var\(--danger-fill\)/);
});
