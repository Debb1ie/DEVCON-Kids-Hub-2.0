-- REVIEW ONLY. Requires the Post Event Report event_assignments table and RBAC helpers.
begin;

do $$
begin
  if to_regclass('public.events') is null or to_regclass('public.event_assignments') is null or to_regclass('public.audit_logs') is null then
    raise exception 'Event application preflight: prerequisite tables are missing';
  end if;
  if to_regtype('public.event_application_status') is not null or to_regclass('public.event_applications') is not null then
    raise exception 'Event application preflight: application objects already exist';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='events' and column_name in ('is_published','applications_open','application_deadline','volunteer_capacity')) then
    raise exception 'Event application preflight: one or more event columns already exist';
  end if;
  if to_regprocedure('public.apply_to_event(uuid)') is not null
     or to_regprocedure('public.withdraw_event_application(uuid)') is not null
     or to_regprocedure('public.decide_event_application(uuid,text)') is not null then
    raise exception 'Event application preflight: RPC collision';
  end if;
end $$;

create type public.event_application_status as enum ('pending','accepted','rejected','withdrawn');

alter table public.events
  add column is_published boolean not null default false,
  add column applications_open boolean not null default false,
  add column application_deadline timestamptz,
  add column volunteer_capacity integer,
  add constraint events_volunteer_capacity_positive check (volunteer_capacity is null or volunteer_capacity > 0),
  add constraint events_application_window_check check (not applications_open or is_published);

create table public.event_applications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  volunteer_user_id uuid not null references auth.users(id) on delete restrict,
  status public.event_application_status not null default 'pending',
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_applications_one_per_event_user unique(event_id, volunteer_user_id),
  constraint event_application_decision_fields check (
    (status='pending' and decided_by is null and decided_at is null and withdrawn_at is null)
    or (status in ('accepted','rejected') and decided_by is not null and decided_at is not null and withdrawn_at is null)
    or (status='withdrawn' and decided_by is null and decided_at is null and withdrawn_at is not null)
  )
);
create index event_applications_event_status_idx on public.event_applications(event_id,status);
create index event_applications_volunteer_idx on public.event_applications(volunteer_user_id,created_at desc);

create function public.list_open_events_for_volunteers()
returns table(event_id uuid,title text,description text,event_date date,status public.event_status,chapter_name text,application_deadline timestamptz,volunteer_capacity integer,accepted_count bigint,available_slots bigint)
language plpgsql stable security definer set search_path=pg_catalog,public
as $$
begin
  if not public.has_role(array['volunteer']) then raise exception 'Not authorized' using errcode='42501'; end if;
  return query select e.id,e.title,e.description,e.event_date,e.status,c.name,e.application_deadline,e.volunteer_capacity,
    count(a.id) filter(where a.status='accepted'),
    case when e.volunteer_capacity is null then null else greatest(e.volunteer_capacity-count(a.id) filter(where a.status='accepted'),0) end
  from public.events e left join public.chapters c on c.id=e.chapter_id
  left join public.event_applications a on a.event_id=e.id
  where e.is_published and e.applications_open
    and e.status='Scheduled' and (e.application_deadline is null or e.application_deadline>=now())
  group by e.id,c.name
  having e.volunteer_capacity is null or count(a.id) filter(where a.status='accepted')<e.volunteer_capacity
  order by e.event_date nulls last,e.title,e.id;
end
$$;

create function public.list_my_event_applications()
returns table(id uuid,event_id uuid,status public.event_application_status,created_at timestamptz,decided_at timestamptz,withdrawn_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog,public
as $$
begin
  if not public.has_role(array['volunteer']) then raise exception 'Not authorized' using errcode='42501'; end if;
  return query select a.id,a.event_id,a.status,a.created_at,a.decided_at,a.withdrawn_at
    from public.event_applications a where a.volunteer_user_id=auth.uid() order by a.created_at desc;
end
$$;

create function public.apply_to_event(target_event_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public
as $$
declare e public.events%rowtype; existing public.event_applications%rowtype; result_id uuid; accepted_count integer;
begin
  if not public.has_role(array['volunteer']) then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into e from public.events where id=target_event_id for update;
  if not found or not e.is_published or not e.applications_open or e.status<>'Scheduled' then raise exception 'Event is not open for applications' using errcode='P0001'; end if;
  if e.application_deadline is not null and e.application_deadline<now() then raise exception 'Application deadline has passed' using errcode='P0001'; end if;
  select count(*) into accepted_count from public.event_applications where event_id=e.id and status='accepted';
  if e.volunteer_capacity is not null and accepted_count>=e.volunteer_capacity then raise exception 'Event volunteer capacity is full' using errcode='P0001'; end if;
  select * into existing from public.event_applications where event_id=e.id and volunteer_user_id=auth.uid() for update;
  if found then
    if existing.status<>'withdrawn' then raise exception 'An application already exists for this event' using errcode='23505'; end if;
    update public.event_applications
      set status='pending',withdrawn_at=null,decided_by=null,decided_at=null,updated_at=now()
      where id=existing.id returning id into result_id;
    return result_id;
  end if;
  insert into public.event_applications(event_id,volunteer_user_id) values(e.id,auth.uid()) returning id into result_id;
  return result_id;
end $$;

create function public.withdraw_event_application(target_application_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public
as $$
begin
  update public.event_applications set status='withdrawn',withdrawn_at=now(),updated_at=now()
  where id=target_application_id and volunteer_user_id=auth.uid() and status='pending';
  if not found then raise exception 'Pending application not found or not authorized' using errcode='42501'; end if;
end $$;

create function public.list_event_applications_for_management(target_event_id uuid)
returns table(id uuid,event_id uuid,volunteer_name text,status public.event_application_status,created_at timestamptz,decided_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog,public
as $$
begin
  if not public.can_manage_event(target_event_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  return query select a.id,a.event_id,coalesce(p.full_name,'Volunteer'),a.status,a.created_at,a.decided_at
    from public.event_applications a left join public.profiles p on p.id=a.volunteer_user_id
    where a.event_id=target_event_id order by a.created_at;
end $$;

create function public.decide_event_application(target_application_id uuid,new_status text)
returns void language plpgsql security definer set search_path=pg_catalog,public
as $$
declare application public.event_applications%rowtype; e public.events%rowtype; accepted_count integer;
begin
  if new_status not in ('pending','accepted','rejected') then raise exception 'Invalid application decision' using errcode='22023'; end if;
  select * into application from public.event_applications where id=target_application_id for update;
  if not found then raise exception 'Application not found' using errcode='P0001'; end if;
  if application.volunteer_user_id=auth.uid() or not public.can_manage_event(application.event_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  if new_status='pending' and application.status<>'rejected' then raise exception 'Only rejected applications may be reopened' using errcode='P0001'; end if;
  if new_status<>'pending' and application.status<>'pending' then raise exception 'Only pending applications may be decided' using errcode='P0001'; end if;
  select * into e from public.events where id=application.event_id for update;
  if new_status='pending' and (not e.is_published or not e.applications_open or e.status<>'Scheduled' or (e.application_deadline is not null and e.application_deadline<now())) then
    raise exception 'Event is not open for applications' using errcode='P0001';
  end if;
  if new_status='accepted' then
    select count(*) into accepted_count from public.event_applications where event_id=e.id and status='accepted';
    if e.volunteer_capacity is not null and accepted_count>=e.volunteer_capacity then raise exception 'Event volunteer capacity is full' using errcode='P0001'; end if;
  end if;
  update public.event_applications set status=new_status::public.event_application_status,
    decided_by=case when new_status='pending' then null else auth.uid() end,
    decided_at=case when new_status='pending' then null else now() end,
    withdrawn_at=null,updated_at=now() where id=application.id;
  insert into public.audit_logs(actor_id,action,target_table,target_id,metadata)
  values(auth.uid(),'EVENT_APPLICATION_'||upper(new_status),'event_applications',application.id,jsonb_build_object('event_id',application.event_id));
end $$;

alter table public.event_applications enable row level security;
create policy event_applications_select_rbac on public.event_applications for select to authenticated using (
  (volunteer_user_id=auth.uid() and public.has_role(array['volunteer'])) or public.can_manage_event(event_id)
);
revoke all on public.event_applications from anon;
revoke insert,update,delete on public.event_applications from authenticated;
grant select on public.event_applications to authenticated;

revoke all on function public.list_open_events_for_volunteers(),public.list_my_event_applications(),public.apply_to_event(uuid),public.withdraw_event_application(uuid),public.list_event_applications_for_management(uuid),public.decide_event_application(uuid,text) from public,anon;
grant execute on function public.list_open_events_for_volunteers(),public.list_my_event_applications(),public.apply_to_event(uuid),public.withdraw_event_application(uuid),public.list_event_applications_for_management(uuid),public.decide_event_application(uuid,text) to authenticated;

-- Verification queries:
-- select column_name,data_type from information_schema.columns where table_schema='public' and table_name in ('events','event_applications') order by table_name,ordinal_position;
-- select policyname,cmd,roles from pg_policies where schemaname='public' and tablename='event_applications';
-- select status,count(*) from public.event_applications group by status;
commit;

-- Rollback (separate approval): revoke/drop the six RPCs, drop event_applications,
-- drop event_application_status, then drop the four additive events columns/constraints.
-- Never delete application rows automatically once production data exists.
