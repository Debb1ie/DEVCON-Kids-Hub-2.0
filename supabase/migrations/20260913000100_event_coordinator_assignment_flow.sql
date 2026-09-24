-- REVIEW ONLY. UUID-backed, chapter-scoped Event Coordinator assignment.
-- This migration does not create Google Workspace jobs. Folder creation remains
-- exclusively triggered by the first valid Post Event Report submission.
begin;

do $preflight$
begin
  if to_regclass('public.events') is null
     or to_regclass('public.event_assignments') is null
     or to_regclass('public.chapters') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.user_roles') is null then
    raise exception 'Event coordinator flow prerequisites are missing';
  end if;
  if to_regprocedure('public.list_eligible_event_coordinators(uuid)') is not null
     or to_regprocedure('public.save_event_with_coordinator(uuid,uuid,uuid,text,text,text,text,text,date)') is not null then
    raise exception 'Event coordinator flow function collision detected';
  end if;
end
$preflight$;

create function public.list_eligible_event_coordinators(target_chapter_id uuid)
returns table(user_id uuid, full_name text, email text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1 from public.chapters c
    where c.id = target_chapter_id and c.status = 'active'
  ) then
    raise exception 'Event chapter must reference an active directory location';
  end if;

  if not (
    public.has_role(array['super_admin', 'admin'])
    or public.is_chapter_member(target_chapter_id, array['chapter_coordinator'])
    or public.is_chapter_member(target_chapter_id, array['event_coordinator'])
  ) then
    raise exception 'Not authorized to list coordinators for this chapter';
  end if;

  return query
  select p.id, p.full_name, p.email
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  where ur.role = 'event_coordinator'
    and ur.chapter_id = target_chapter_id
    and (
      not public.has_role(array['event_coordinator'])
      or ur.user_id = auth.uid()
    )
  order by coalesce(nullif(btrim(p.full_name), ''), p.email), p.id;
end;
$$;

create function public.save_event_with_coordinator(
  target_event_id uuid,
  target_chapter_id uuid,
  target_coordinator_id uuid,
  event_title text,
  event_type text,
  event_description text,
  event_image_url text,
  event_status_value text,
  event_date_value date
)
returns public.events
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  existing_event public.events;
  saved_event public.events;
  coordinator_name text;
  current_coordinator_id uuid;
  current_assignment_count integer := 0;
  normalized_status public.event_status;
  actor_is_admin boolean := public.has_role(array['super_admin', 'admin']);
  actor_is_chapter_coordinator boolean := public.is_chapter_member(target_chapter_id, array['chapter_coordinator']);
begin
  if nullif(btrim(event_title), '') is null then
    raise exception 'Event title is required';
  end if;
  if not exists (
    select 1 from public.chapters c
    where c.id = target_chapter_id and c.status = 'active'
  ) then
    raise exception 'Event chapter must reference an active directory location';
  end if;

  select coalesce(nullif(btrim(p.full_name), ''), p.email)
  into coordinator_name
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  where ur.user_id = target_coordinator_id
    and ur.role = 'event_coordinator'
    and ur.chapter_id = target_chapter_id;

  if coordinator_name is null then
    raise exception 'Coordinator must be an active approved Event Coordinator in the selected chapter';
  end if;

  begin
    normalized_status := event_status_value::public.event_status;
  exception when invalid_text_representation then
    raise exception 'Invalid event status';
  end;

  if target_event_id is null then
    if not (actor_is_admin or actor_is_chapter_coordinator) then
      raise exception 'Not authorized to create this event';
    end if;

    insert into public.events(
      chapter_id, created_by, title, type, chapter, coordinator,
      description, image_url, status, event_date
    )
    select target_chapter_id, auth.uid(), btrim(event_title), nullif(btrim(event_type), ''),
           c.name, coordinator_name, nullif(btrim(event_description), ''),
           nullif(btrim(event_image_url), ''), normalized_status, event_date_value
    from public.chapters c where c.id = target_chapter_id
    returning * into saved_event;

    insert into public.event_assignments(event_id, user_id, assignment_role, assigned_by)
    values(saved_event.id, target_coordinator_id, 'event_coordinator', auth.uid());
  else
    select * into existing_event
    from public.events where id = target_event_id
    for update;
    if not found then raise exception 'Event not found'; end if;

    select count(*)::integer,
           (array_agg(ea.user_id order by ea.created_at, ea.user_id))[1]
    into current_assignment_count, current_coordinator_id
    from public.event_assignments ea
    where ea.event_id = target_event_id and ea.assignment_role = 'event_coordinator';

    if not (
      actor_is_admin
      or (
        public.is_chapter_member(existing_event.chapter_id, array['chapter_coordinator'])
        and actor_is_chapter_coordinator
      )
      or (
        public.is_event_assigned(target_event_id)
        and target_chapter_id = existing_event.chapter_id
        and target_coordinator_id = auth.uid()
        and current_coordinator_id = auth.uid()
        and current_assignment_count = 1
      )
    ) then
      raise exception 'Not authorized to update this event';
    end if;

    update public.events
    set chapter_id = target_chapter_id,
        title = btrim(event_title),
        type = nullif(btrim(event_type), ''),
        chapter = (select c.name from public.chapters c where c.id = target_chapter_id),
        coordinator = coordinator_name,
        description = nullif(btrim(event_description), ''),
        image_url = nullif(btrim(event_image_url), ''),
        status = normalized_status,
        event_date = event_date_value
    where id = target_event_id
    returning * into saved_event;

    if current_assignment_count <> 1 or current_coordinator_id is distinct from target_coordinator_id then
      delete from public.event_assignments
      where event_id = target_event_id and assignment_role = 'event_coordinator';
      insert into public.event_assignments(event_id, user_id, assignment_role, assigned_by)
      values(target_event_id, target_coordinator_id, 'event_coordinator', auth.uid());
    end if;
  end if;

  insert into public.audit_logs(actor_id, action, target_table, target_id, metadata)
  values(
    auth.uid(),
    case when target_event_id is null then 'EVENT_CREATE_WITH_COORDINATOR' else 'EVENT_UPDATE_WITH_COORDINATOR' end,
    'events', saved_event.id,
    jsonb_build_object('chapter_id', target_chapter_id, 'coordinator_id', target_coordinator_id)
  );

  return saved_event;
end;
$$;

revoke all on function public.list_eligible_event_coordinators(uuid) from public, anon;
revoke all on function public.save_event_with_coordinator(uuid,uuid,uuid,text,text,text,text,text,date) from public, anon;
grant execute on function public.list_eligible_event_coordinators(uuid) to authenticated;
grant execute on function public.save_event_with_coordinator(uuid,uuid,uuid,text,text,text,text,text,date) to authenticated;

comment on function public.list_eligible_event_coordinators(uuid) is
  'Returns approved Event Coordinators for one authorized active chapter; Event Coordinators can resolve only themselves.';
comment on function public.save_event_with_coordinator(uuid,uuid,uuid,text,text,text,text,text,date) is
  'Atomically creates or updates an event and its single UUID-backed Event Coordinator assignment. Does not queue Google automation.';

commit;

-- Verification after separately approved deployment:
-- select proname, prosecdef, proconfig from pg_proc join pg_namespace n on n.oid=pronamespace
-- where n.nspname='public' and proname in ('list_eligible_event_coordinators','save_event_with_coordinator');
-- select event_id, count(*) from public.event_assignments where assignment_role='event_coordinator'
-- group by event_id having count(*) <> 1;
-- select count(*) from public.google_workspace_jobs where created_at >= :deployment_started_at;
--
-- Rollback (separate approval): revoke execute and drop both functions by exact signature.
-- Existing event and assignment rows created through the RPC are operational data and must not be deleted automatically.
