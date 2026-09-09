-- REVIEW ONLY. Do not apply remotely without separate approval.
-- Adds the approved DEVCON Philippines assignable-location directory.

do $preflight$
begin
  if to_regclass('public.chapters') is null
     or to_regclass('public.user_roles') is null
     or to_regtype('public.app_role') is null then
    raise exception 'Location directory prerequisites are missing';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='chapters' and column_name='location_type') then
    raise exception 'chapters.location_type already exists; review before applying';
  end if;
  if to_regprocedure('public.admin_list_assignable_locations()') is not null then
    raise exception 'admin_list_assignable_locations() already exists; review before applying';
  end if;
  if exists (select 1 from public.chapters group by lower(btrim(name)) having count(*) > 1) then
    raise exception 'Duplicate normalized chapter names must be reviewed before applying';
  end if;
end
$preflight$;

alter table public.chapters
  add column location_type text not null default 'chapter';

alter table public.chapters
  add constraint chapters_location_type_check
  check (location_type in ('chapter', 'volunteer_community'));

create unique index chapters_normalized_name_uidx
  on public.chapters (lower(btrim(name)));

do $conflicts$
declare conflict_name text;
begin
  with approved(name, location_type) as (values
    ('Manila','chapter'),('Laguna','chapter'),('Pampanga','chapter'),
    ('Legazpi','chapter'),('Cebu','chapter'),('Iloilo','chapter'),
    ('Davao','chapter'),('Iligan','chapter'),('Bukidnon','chapter'),
    ('Bohol','volunteer_community'),('Bacolod','volunteer_community'),
    ('CDO','volunteer_community')
  )
  select c.name into conflict_name
  from public.chapters c join approved a on lower(btrim(c.name))=lower(a.name)
  where c.location_type <> a.location_type or c.status <> 'active'
  limit 1;
  if conflict_name is not null then
    raise exception 'Existing location % conflicts with the approved type or active status', conflict_name;
  end if;
end
$conflicts$;

with approved(name, location_type) as (values
  ('Manila','chapter'),('Laguna','chapter'),('Pampanga','chapter'),
  ('Legazpi','chapter'),('Cebu','chapter'),('Iloilo','chapter'),
  ('Davao','chapter'),('Iligan','chapter'),('Bukidnon','chapter'),
  ('Bohol','volunteer_community'),('Bacolod','volunteer_community'),
  ('CDO','volunteer_community')
)
insert into public.chapters(id, name, location_type, status)
select gen_random_uuid(), a.name, a.location_type, 'active'
from approved a
where not exists (select 1 from public.chapters c where lower(btrim(c.name))=lower(a.name));

create function public.admin_list_assignable_locations()
returns table(location_id uuid, display_name text, location_type text, is_active boolean)
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1 from public.user_roles
    where user_id=auth.uid() and role in ('super_admin','admin')
  ) then raise exception 'Not authorized'; end if;

  return query
  select c.id,
    case when c.location_type='volunteer_community'
      then c.name || ' (Volunteer Community)' else c.name end,
    c.location_type,
    c.status='active'
  from public.chapters c
  where c.status='active'
  order by case c.location_type when 'chapter' then 0 else 1 end, c.name, c.id;
end;
$$;

revoke all on function public.admin_list_assignable_locations() from public, anon;
grant execute on function public.admin_list_assignable_locations() to authenticated;

do $verify$
declare chapter_count integer; community_count integer;
begin
  select count(*) filter(where location_type='chapter'),
         count(*) filter(where location_type='volunteer_community')
  into chapter_count, community_count
  from public.chapters
  where lower(btrim(name)) in ('manila','laguna','pampanga','legazpi','cebu','iloilo','davao','iligan','bukidnon','bohol','bacolod','cdo');
  if chapter_count <> 9 or community_count <> 3 then
    raise exception 'Approved roster verification failed: chapters %, communities %', chapter_count, community_count;
  end if;
end
$verify$;

-- Verification:
-- select location_type, count(*) from public.chapters
-- where lower(btrim(name)) in ('manila','laguna','pampanga','legazpi','cebu','iloilo','davao','iligan','bukidnon','bohol','bacolod','cdo')
-- group by location_type;
-- select * from public.admin_list_assignable_locations(); -- as an authorized local identity

-- Rollback considerations (manual review required):
-- 1. Drop admin_list_assignable_locations() and chapters_normalized_name_uidx.
-- 2. Remove only migration-created, unreferenced roster rows; never remove reused rows.
-- 3. Drop chapters_location_type_check, then location_type.
-- No automatic destructive rollback is included because existing matching locations may be reused.
