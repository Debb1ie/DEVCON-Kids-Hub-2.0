-- REVIEW ONLY. Additive enforcement for UUID-backed event chapter authorization.
begin;

do $$
begin
  if to_regclass('public.events') is null or to_regclass('public.chapters') is null then
    raise exception 'Event identifier preflight: events or chapters table is missing';
  end if;
  if exists(select 1 from pg_constraint where conname='events_chapter_id_required' and conrelid='public.events'::regclass) then
    raise exception 'Event identifier preflight: events_chapter_id_required already exists';
  end if;
  if to_regprocedure('public.validate_event_chapter_id()') is not null then
    raise exception 'Event identifier preflight: validate_event_chapter_id already exists';
  end if;
end $$;

-- NOT VALID preserves legacy rows with a missing chapter while enforcing every new/updated row.
alter table public.events add constraint events_chapter_id_required check(chapter_id is not null) not valid;

create function public.validate_event_chapter_id()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public
as $$
begin
  if not exists(select 1 from public.chapters c where c.id=new.chapter_id and c.status='active') then
    raise exception 'Event chapter must reference an active directory location' using errcode='23514';
  end if;
  return new;
end
$$;

create trigger validate_event_chapter_id_before_write
before insert or update of chapter_id on public.events
for each row execute function public.validate_event_chapter_id();

-- Verification:
-- select id,title,chapter_id from public.events where chapter_id is null;
-- select conname,convalidated from pg_constraint where conrelid='public.events'::regclass and conname='events_chapter_id_required';
-- select tgname from pg_trigger where tgrelid='public.events'::regclass and not tgisinternal;

commit;

-- Rollback (separate approval): drop trigger validate_event_chapter_id_before_write on public.events;
-- drop function public.validate_event_chapter_id(); alter table public.events drop constraint events_chapter_id_required;
