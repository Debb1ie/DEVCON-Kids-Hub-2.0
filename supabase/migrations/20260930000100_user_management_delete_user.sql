-- REVIEW ONLY. Do not apply without explicit approval.
-- User Management deletion authorization and the final Super Admin invariant.
-- Safe to re-run: functions use CREATE OR REPLACE and the trigger is recreated.
--
-- Deletion flow: the admin-delete-user Edge Function calls
-- admin_authorize_user_deletion with the caller's own JWT (auth.uid() is the
-- signed-in actor). Only after it succeeds does the function delete the
-- auth.users row with its server-side service role. profiles and user_roles
-- cascade from auth.users; history tables that use ON DELETE RESTRICT make the
-- whole deletion fail atomically instead of leaving orphaned records.
--
-- Final Super Admin protection is enforced by a trigger on public.user_roles,
-- so it holds for every path (RPC role change, cascaded auth deletion, direct
-- service-role writes) and under concurrency: each removal takes the same
-- transaction-scoped advisory lock and re-counts after acquiring it, so two
-- Super Admins removing each other at the same time are serialized and the
-- second removal is rejected.

begin;

do $preflight$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.user_roles') is null
     or to_regclass('public.audit_logs') is null
     or to_regtype('public.app_role') is null then
    raise exception 'User deletion prerequisites are missing';
  end if;
end
$preflight$;

create or replace function public.admin_authorize_user_deletion(target_user_id uuid)
returns table (
  deleted_user_id uuid,
  deleted_email text,
  deleted_name text,
  deleted_role public.app_role
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_role public.app_role;
  target_role public.app_role;
  target_role_rows integer;
begin
  -- Same lock as admin_manage_user_role and the guard trigger.
  perform pg_advisory_xact_lock(hashtext('devcon_user_role_management'));

  if auth.uid() is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select ur.role into actor_role
  from public.user_roles ur
  where ur.user_id = auth.uid()
  order by case ur.role when 'super_admin' then 1 when 'admin' then 2 else 3 end
  limit 1;

  if actor_role is null or actor_role not in ('super_admin', 'admin') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if target_user_id is null then
    raise exception 'A user is required' using errcode = '22023';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'You cannot delete your own account' using errcode = '42501';
  end if;

  select count(*) into target_role_rows from public.user_roles ur where ur.user_id = target_user_id;
  if target_role_rows <> 1 then
    raise exception 'Expected exactly one role assignment' using errcode = 'P0002';
  end if;

  select ur.role into target_role from public.user_roles ur where ur.user_id = target_user_id;

  if actor_role = 'admin' and target_role in ('super_admin', 'admin') then
    raise exception 'Only a Super Admin can delete administrative accounts' using errcode = '42501';
  end if;

  if target_role = 'super_admin' and
     (select count(*) from public.user_roles ur where ur.role = 'super_admin' and ur.user_id <> target_user_id) < 1 then
    raise exception 'The final Super Admin cannot be deleted' using errcode = '42501';
  end if;

  return query
  select p.id, p.email, p.full_name, target_role
  from public.profiles p
  where p.id = target_user_id;

  if not found then
    raise exception 'User profile not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_authorize_user_deletion(uuid) from public, anon;
grant execute on function public.admin_authorize_user_deletion(uuid) to authenticated;

comment on function public.admin_authorize_user_deletion(uuid) is
  'Authorizes a User Management deletion for the calling actor: admin or super_admin only, never self, Admin cannot delete Admin or Super Admin, final Super Admin protected. Performs no writes.';

create or replace function public.guard_final_super_admin()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.role = 'super_admin' and (tg_op = 'DELETE' or new.role is distinct from 'super_admin') then
    -- Serialize every Super Admin removal, then count with a fresh snapshot.
    perform pg_advisory_xact_lock(hashtext('devcon_user_role_management'));
    if not exists (
      select 1 from public.user_roles ur
      where ur.role = 'super_admin' and ur.user_id <> old.user_id
    ) then
      raise exception 'The final Super Admin cannot be removed' using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.guard_final_super_admin() from public, anon, authenticated;

drop trigger if exists guard_final_super_admin_trigger on public.user_roles;
create trigger guard_final_super_admin_trigger
  before update of role or delete on public.user_roles
  for each row execute function public.guard_final_super_admin();

commit;

-- Rollback:
-- drop trigger if exists guard_final_super_admin_trigger on public.user_roles;
-- drop function if exists public.guard_final_super_admin();
-- drop function if exists public.admin_authorize_user_deletion(uuid);
