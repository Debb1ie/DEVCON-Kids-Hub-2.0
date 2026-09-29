-- REVIEW ONLY. Adds the Event venue source field used by Post Event Reports.
-- Do not apply automatically; deploy only after reviewing production schema/RLS.
begin;

alter table public.events add column if not exists venue text;

create function public.save_event_with_coordinator(
  target_event_id uuid,
  target_chapter_id uuid,
  target_coordinator_id uuid,
  event_title text,
  event_type text,
  event_description text,
  event_image_url text,
  event_status_value text,
  event_date_value date,
  event_venue text
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
  if nullif(btrim(event_title), '') is null then raise exception 'Event title is required'; end if;
  if event_date_value is null then raise exception 'Event date is required'; end if;
  if nullif(btrim(event_venue), '') is null then raise exception 'Event venue is required'; end if;
  if not exists (select 1 from public.chapters c where c.id = target_chapter_id and c.status = 'active') then
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
    if not (actor_is_admin or actor_is_chapter_coordinator) then raise exception 'Not authorized to create this event'; end if;
    insert into public.events(
      chapter_id, created_by, title, type, chapter, coordinator,
      description, image_url, status, event_date, venue
    )
    select target_chapter_id, auth.uid(), btrim(event_title), nullif(btrim(event_type), ''),
           c.name, coordinator_name, nullif(btrim(event_description), ''),
           nullif(btrim(event_image_url), ''), normalized_status, event_date_value, btrim(event_venue)
    from public.chapters c where c.id = target_chapter_id
    returning * into saved_event;

    insert into public.event_assignments(event_id, user_id, assignment_role, assigned_by)
    values(saved_event.id, target_coordinator_id, 'event_coordinator', auth.uid());
  else
    select * into existing_event from public.events where id = target_event_id for update;
    if not found then raise exception 'Event not found'; end if;

    select count(*)::integer, (array_agg(ea.user_id order by ea.created_at, ea.user_id))[1]
    into current_assignment_count, current_coordinator_id
    from public.event_assignments ea
    where ea.event_id = target_event_id and ea.assignment_role = 'event_coordinator';

    if not (
      actor_is_admin
      or (public.is_chapter_member(existing_event.chapter_id, array['chapter_coordinator']) and actor_is_chapter_coordinator)
      or (public.is_event_assigned(target_event_id) and target_chapter_id = existing_event.chapter_id
          and target_coordinator_id = auth.uid() and current_coordinator_id = auth.uid()
          and current_assignment_count = 1)
    ) then raise exception 'Not authorized to update this event'; end if;

    update public.events
    set chapter_id = target_chapter_id,
        title = btrim(event_title),
        type = nullif(btrim(event_type), ''),
        chapter = (select c.name from public.chapters c where c.id = target_chapter_id),
        coordinator = coordinator_name,
        description = nullif(btrim(event_description), ''),
        image_url = nullif(btrim(event_image_url), ''),
        status = normalized_status,
        event_date = event_date_value,
        venue = btrim(event_venue)
    where id = target_event_id
    returning * into saved_event;

    if current_assignment_count <> 1 or current_coordinator_id is distinct from target_coordinator_id then
      delete from public.event_assignments where event_id = target_event_id and assignment_role = 'event_coordinator';
      insert into public.event_assignments(event_id, user_id, assignment_role, assigned_by)
      values(target_event_id, target_coordinator_id, 'event_coordinator', auth.uid());
    end if;
  end if;

  insert into public.audit_logs(actor_id, action, target_table, target_id, metadata)
  values(auth.uid(), case when target_event_id is null then 'EVENT_CREATE_WITH_COORDINATOR' else 'EVENT_UPDATE_WITH_COORDINATOR' end,
         'events', saved_event.id, jsonb_build_object('chapter_id', target_chapter_id, 'coordinator_id', target_coordinator_id));
  return saved_event;
end;
$$;

revoke all on function public.save_event_with_coordinator(uuid,uuid,uuid,text,text,text,text,text,date,text) from public, anon;
grant execute on function public.save_event_with_coordinator(uuid,uuid,uuid,text,text,text,text,text,date,text) to authenticated;
comment on function public.save_event_with_coordinator(uuid,uuid,uuid,text,text,text,text,text,date,text) is
  'Atomically creates or updates an event, its venue, and its single UUID-backed Event Coordinator assignment.';

commit;

-- Rollback: revoke and drop only the ten-argument overload, then drop the venue
-- column after confirming it is unused. The existing nine-argument function remains intact.
