-- REVIEW ONLY. Do not apply without explicit approval.
-- Centralizes role administration so clients never write user_roles directly.

do $preflight$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.user_roles') is null
     or to_regclass('public.chapters') is null
     or to_regclass('public.audit_logs') is null
     or to_regtype('public.app_role') is null then
    raise exception 'User Management prerequisites are missing';
  end if;
  if to_regprocedure('public.admin_list_users(text,public.app_role,uuid)') is not null
     or to_regprocedure('public.admin_manage_user_role(uuid,public.app_role,uuid)') is not null then
    raise exception 'User Management function collision detected; review ownership and definition before proceeding';
  end if;
end
$preflight$;

create function public.admin_list_users(
  search_query text default null,
  role_filter public.app_role default null,
  chapter_filter uuid default null
)
returns table (
  user_id uuid,
  full_name text,
  email text,
  avatar_url text,
  role public.app_role,
  chapter_id uuid,
  chapter_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1 from public.user_roles actor
    where actor.user_id = auth.uid()
      and actor.role in ('super_admin', 'admin')
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  select p.id, p.full_name, p.email, p.avatar_url, ur.role,
         ur.chapter_id, c.name, p.created_at
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.id
  left join public.chapters c on c.id = ur.chapter_id
  where (nullif(btrim(search_query), '') is null
      or p.full_name ilike '%' || btrim(search_query) || '%'
      or p.email ilike '%' || btrim(search_query) || '%')
    and (role_filter is null or ur.role = role_filter)
    and (chapter_filter is null or ur.chapter_id = chapter_filter)
  order by p.created_at desc, p.id;
end;
$$;

create function public.admin_manage_user_role(
  target_user_id uuid,
  new_role public.app_role,
  new_chapter_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_role public.app_role;
  target_role public.app_role;
  target_chapter uuid;
  normalized_chapter uuid;
  target_role_rows integer;
  changed_rows integer;
begin
  -- Serialize all role transitions that could affect the final Super Admin invariant.
  perform pg_advisory_xact_lock(hashtext('devcon_user_role_management'));

  select role into actor_role
  from public.user_roles
  where user_id = auth.uid()
  order by case role when 'super_admin' then 1 when 'admin' then 2 else 3 end
  limit 1;

  if actor_role not in ('super_admin', 'admin') then
    raise exception 'Not authorized';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'You cannot change your own role';
  end if;

  select count(*) into target_role_rows from public.user_roles where user_id = target_user_id;
  if target_role_rows <> 1 then
    raise exception 'Expected exactly one role assignment';
  end if;

  select role, chapter_id into target_role, target_chapter
  from public.user_roles where user_id = target_user_id
  for update;
  if not found then raise exception 'Role assignment not found'; end if;

  if actor_role = 'admin' and
     (target_role in ('super_admin', 'admin') or new_role in ('super_admin', 'admin')) then
    raise exception 'Only a Super Admin can manage administrative roles';
  end if;

  if target_role = 'super_admin' and new_role <> 'super_admin' and
     (select count(*) from public.user_roles where role = 'super_admin') <= 1 then
    raise exception 'The final Super Admin cannot be reassigned';
  end if;

  if new_role in ('chapter_coordinator', 'event_coordinator', 'volunteer') then
    if new_chapter_id is null or not exists (select 1 from public.chapters where id = new_chapter_id) then
      raise exception 'A valid chapter is required for this role';
    end if;
    normalized_chapter := new_chapter_id;
  else
    normalized_chapter := null;
  end if;

  update public.user_roles
  set role = new_role, chapter_id = normalized_chapter
  where user_id = target_user_id;
  get diagnostics changed_rows = row_count;
  if changed_rows <> 1 then raise exception 'Role update did not affect exactly one row'; end if;

  insert into public.audit_logs(actor_id, action, target_table, target_id, metadata)
  values (auth.uid(), 'ROLE_UPDATE', 'user_roles', target_user_id,
    jsonb_build_object('from_role', target_role, 'to_role', new_role,
      'from_chapter_id', target_chapter, 'to_chapter_id', normalized_chapter));
end;
$$;

revoke all on function public.admin_list_users(text, public.app_role, uuid) from public, anon;
revoke all on function public.admin_manage_user_role(uuid, public.app_role, uuid) from public, anon;
grant execute on function public.admin_list_users(text, public.app_role, uuid) to authenticated;
grant execute on function public.admin_manage_user_role(uuid, public.app_role, uuid) to authenticated;

comment on function public.admin_list_users(text, public.app_role, uuid) is 'Admin-only filtered user directory for the management UI.';
comment on function public.admin_manage_user_role(uuid, public.app_role, uuid) is
  'Atomic role change enforcing actor permissions, self-change prevention, final Super Admin protection, chapter validation, and audit logging.';

-- Rollback:
-- drop function if exists public.admin_manage_user_role(uuid, public.app_role, uuid);
-- drop function if exists public.admin_list_users(text, public.app_role, uuid);
