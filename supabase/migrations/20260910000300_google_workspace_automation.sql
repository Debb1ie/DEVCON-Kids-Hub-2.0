-- REVIEW ONLY: Google Workspace automation outbox and Super Admin controls.
-- Do not deploy without a separate controlled Supabase approval.
begin;

do $$
declare collision text;
begin
  if to_regclass('public.events') is null
     or to_regclass('public.post_event_reports') is null
     or to_regclass('public.audit_logs') is null
     or to_regprocedure('public.has_role(text[])') is null
     or to_regprocedure('public.set_updated_at()') is null then
    raise exception 'Google Workspace preflight failed: required baseline objects are missing';
  end if;
  select c.relname into collision
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in (
    'google_workspace_settings', 'google_workspace_jobs',
    'google_workspace_event_links', 'google_workspace_report_syncs'
  ) limit 1;
  if collision is not null then
    raise exception 'Google Workspace preflight failed: object already exists: %', collision;
  end if;
end $$;

create table public.google_workspace_settings (
  singleton boolean primary key default true check (singleton),
  shared_drive_root_folder_id text,
  report_sheet_id text,
  automatic_folder_creation_enabled boolean not null default false,
  sheet_synchronization_enabled boolean not null default false,
  report_sheet_tab_name text not null default 'Post Event Reports',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_root_folder_id_format check (
    shared_drive_root_folder_id is null or shared_drive_root_folder_id ~ '^[A-Za-z0-9_-]{10,200}$'
  ),
  constraint google_sheet_id_format check (
    report_sheet_id is null or report_sheet_id ~ '^[A-Za-z0-9_-]{10,200}$'
  ),
  constraint google_sheet_tab_name_format check (
    length(btrim(report_sheet_tab_name)) between 1 and 100
    and report_sheet_tab_name !~ '[\\[\\]*?/\\:]'
  )
);

create table public.google_workspace_event_links (
  event_id uuid primary key references public.events(id) on delete cascade,
  google_folder_id text not null unique,
  google_folder_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.google_workspace_report_syncs (
  report_id uuid primary key references public.post_event_reports(id) on delete cascade,
  sheet_row_number bigint generated always as identity (start with 2) unique,
  sheet_row_reference text,
  last_synced_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.google_workspace_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('create_event_folder', 'sync_report_sheet')),
  event_id uuid references public.events(id) on delete cascade,
  report_id uuid references public.post_event_reports(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  safe_error_message text,
  idempotency_key text not null unique,
  external_reference text,
  available_at timestamptz not null default now(),
  processing_started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_job_target check (
    (job_type = 'create_event_folder' and event_id is not null and report_id is null)
    or (job_type = 'sync_report_sheet' and report_id is not null)
  )
);

create index google_workspace_jobs_process_idx
  on public.google_workspace_jobs(status, available_at, created_at);
create index google_workspace_jobs_event_idx on public.google_workspace_jobs(event_id);
create index google_workspace_jobs_report_idx on public.google_workspace_jobs(report_id);

create trigger google_workspace_settings_updated_at
before update on public.google_workspace_settings
for each row execute function public.set_updated_at();
create trigger google_workspace_event_links_updated_at
before update on public.google_workspace_event_links
for each row execute function public.set_updated_at();
create trigger google_workspace_report_syncs_updated_at
before update on public.google_workspace_report_syncs
for each row execute function public.set_updated_at();
create trigger google_workspace_jobs_updated_at
before update on public.google_workspace_jobs
for each row execute function public.set_updated_at();

create or replace function public.google_resource_id(input_value text, resource_kind text)
returns text language plpgsql immutable
set search_path = pg_catalog, public
as $$
declare cleaned text := btrim(coalesce(input_value, '')); extracted text;
begin
  if cleaned = '' then return null; end if;
  if cleaned ~ '^https?://' then
    if resource_kind = 'folder' and cleaned !~ '^https://drive\.google\.com/' then
      raise exception using errcode = '22023', message = 'Enter a valid Google Drive folder URL.';
    elsif resource_kind = 'sheet' and cleaned !~ '^https://docs\.google\.com/spreadsheets/' then
      raise exception using errcode = '22023', message = 'Enter a valid Google Sheets URL.';
    end if;
  end if;
  if resource_kind = 'folder' then
    extracted := substring(cleaned from 'folders/([A-Za-z0-9_-]{10,200})');
    if extracted is null then extracted := substring(cleaned from '[?&]id=([A-Za-z0-9_-]{10,200})'); end if;
  elsif resource_kind = 'sheet' then
    extracted := substring(cleaned from 'spreadsheets/d/([A-Za-z0-9_-]{10,200})');
    if extracted is null then extracted := substring(cleaned from '[?&]id=([A-Za-z0-9_-]{10,200})'); end if;
  else
    raise exception using errcode = '22023', message = 'Unsupported Google resource type.';
  end if;
  if extracted is null and cleaned ~ '^[A-Za-z0-9_-]{10,200}$' then extracted := cleaned; end if;
  if extracted is null then
    raise exception using errcode = '22023', message = 'Enter a valid Google resource URL or ID.';
  end if;
  return extracted;
end $$;

create or replace function public.get_google_workspace_settings()
returns public.google_workspace_settings
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare result public.google_workspace_settings;
begin
  if not public.has_role(array['super_admin']) then
    raise exception using errcode = '42501', message = 'Integration settings are unavailable for this account.';
  end if;
  select * into result from public.google_workspace_settings where singleton;
  return result;
end $$;

create or replace function public.update_google_workspace_settings(
  shared_drive_root text,
  report_sheet text,
  automatic_folders boolean,
  sheet_sync boolean,
  sheet_tab_name text default 'Post Event Reports'
)
returns public.google_workspace_settings
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare result public.google_workspace_settings;
begin
  if not public.has_role(array['super_admin']) then
    raise exception using errcode = '42501', message = 'Only a Super Admin can change integration settings.';
  end if;
  if automatic_folders and nullif(btrim(coalesce(shared_drive_root, '')), '') is null then
    raise exception using errcode = '22023', message = 'A Shared Drive root folder is required when folder automation is enabled.';
  end if;
  if sheet_sync and nullif(btrim(coalesce(report_sheet, '')), '') is null then
    raise exception using errcode = '22023', message = 'A Google Sheet is required when synchronization is enabled.';
  end if;
  insert into public.google_workspace_settings (
    singleton, shared_drive_root_folder_id, report_sheet_id,
    automatic_folder_creation_enabled, sheet_synchronization_enabled,
    report_sheet_tab_name, updated_by
  ) values (
    true, public.google_resource_id(shared_drive_root, 'folder'),
    public.google_resource_id(report_sheet, 'sheet'), coalesce(automatic_folders, false),
    coalesce(sheet_sync, false), coalesce(nullif(btrim(sheet_tab_name), ''), 'Post Event Reports'), auth.uid()
  ) on conflict (singleton) do update set
    shared_drive_root_folder_id = excluded.shared_drive_root_folder_id,
    report_sheet_id = excluded.report_sheet_id,
    automatic_folder_creation_enabled = excluded.automatic_folder_creation_enabled,
    sheet_synchronization_enabled = excluded.sheet_synchronization_enabled,
    report_sheet_tab_name = excluded.report_sheet_tab_name,
    updated_by = auth.uid();
  insert into public.audit_logs(actor_id, action, target_table, metadata)
  values (auth.uid(), 'UPDATE_GOOGLE_WORKSPACE_SETTINGS', 'google_workspace_settings',
    jsonb_build_object('automatic_folders', coalesce(automatic_folders, false), 'sheet_sync', coalesce(sheet_sync, false)));
  select * into result from public.google_workspace_settings where singleton;
  return result;
end $$;

create or replace function public.retry_google_workspace_job(job_id uuid)
returns public.google_workspace_jobs
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare result public.google_workspace_jobs;
begin
  if not public.has_role(array['super_admin']) then
    raise exception using errcode = '42501', message = 'Only a Super Admin can retry integration jobs.';
  end if;
  update public.google_workspace_jobs set status = 'pending', safe_error_message = null,
    available_at = now(), processing_started_at = null, completed_at = null
  where id = job_id and status = 'failed' returning * into result;
  if result.id is null then raise exception using errcode = '22023', message = 'Only failed jobs can be retried.'; end if;
  insert into public.audit_logs(actor_id, action, target_table, target_id)
  values (auth.uid(), 'RETRY_GOOGLE_WORKSPACE_JOB', 'google_workspace_jobs', job_id);
  return result;
end $$;

create or replace function public.queue_google_event_folder()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (select 1 from public.google_workspace_settings where singleton and automatic_folder_creation_enabled) then
    insert into public.google_workspace_jobs(job_type, event_id, idempotency_key)
    values ('create_event_folder', new.id, 'event-folder:' || new.id::text)
    on conflict (idempotency_key) do nothing;
  end if;
  return new;
end $$;

create or replace function public.queue_google_report_sync()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status is distinct from old.status
     and new.status::text in ('submitted', 'needs_revision', 'approved')
     and exists (select 1 from public.google_workspace_settings where singleton and sheet_synchronization_enabled) then
    insert into public.google_workspace_jobs(job_type, event_id, report_id, idempotency_key)
    values ('sync_report_sheet', new.event_id, new.id,
      'report-sheet:' || new.id::text || ':' || new.status::text || ':' || coalesce(new.updated_at::text, now()::text))
    on conflict (idempotency_key) do nothing;
  end if;
  return new;
end $$;

create trigger queue_google_event_folder_trigger
after insert on public.events for each row execute function public.queue_google_event_folder();
create trigger queue_google_report_sync_trigger
after update of status on public.post_event_reports
for each row execute function public.queue_google_report_sync();

-- Worker-only claim and completion RPCs. Browser roles receive no execute grant.
create or replace function public.claim_google_workspace_jobs(batch_size integer default 10)
returns setof public.google_workspace_jobs language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  with candidates as (
    select id from public.google_workspace_jobs
    where status = 'pending' and available_at <= now()
    order by created_at for update skip locked limit greatest(1, least(batch_size, 25))
  )
  update public.google_workspace_jobs j set status = 'processing', attempt_count = attempt_count + 1,
    processing_started_at = now(), safe_error_message = null
  from candidates c where j.id = c.id returning j.*;
end $$;

create or replace function public.finish_google_workspace_job(job_id uuid, succeeded boolean, safe_error text default null, external_ref text default null)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  update public.google_workspace_jobs set
    status = case when succeeded then 'succeeded' else 'failed' end,
    safe_error_message = case when succeeded then null else left(coalesce(safe_error, 'The provider operation failed.'), 300) end,
    external_reference = coalesce(external_ref, external_reference), completed_at = now()
  where id = job_id and status = 'processing';
  if not found then raise exception 'Job is not processing'; end if;
end $$;

alter table public.google_workspace_settings enable row level security;
alter table public.google_workspace_jobs enable row level security;
alter table public.google_workspace_event_links enable row level security;
alter table public.google_workspace_report_syncs enable row level security;

create policy google_workspace_settings_superadmin on public.google_workspace_settings
for select to authenticated using (public.has_role(array['super_admin']));
create policy google_workspace_jobs_superadmin on public.google_workspace_jobs
for select to authenticated using (public.has_role(array['super_admin']));
create policy google_workspace_event_links_superadmin on public.google_workspace_event_links
for select to authenticated using (public.has_role(array['super_admin']));
create policy google_workspace_report_syncs_superadmin on public.google_workspace_report_syncs
for select to authenticated using (public.has_role(array['super_admin']));

revoke all on public.google_workspace_settings, public.google_workspace_jobs,
  public.google_workspace_event_links, public.google_workspace_report_syncs from public, anon, authenticated;
grant select on public.google_workspace_jobs to authenticated;
grant all on public.google_workspace_settings, public.google_workspace_jobs,
  public.google_workspace_event_links, public.google_workspace_report_syncs to service_role;
revoke all on function public.google_resource_id(text,text) from public, anon, authenticated;
revoke all on function public.get_google_workspace_settings() from public, anon;
revoke all on function public.update_google_workspace_settings(text,text,boolean,boolean,text) from public, anon;
revoke all on function public.retry_google_workspace_job(uuid) from public, anon;
grant execute on function public.get_google_workspace_settings() to authenticated;
grant execute on function public.update_google_workspace_settings(text,text,boolean,boolean,text) to authenticated;
grant execute on function public.retry_google_workspace_job(uuid) to authenticated;
revoke all on function public.queue_google_event_folder(), public.queue_google_report_sync()
  from public, anon, authenticated;
revoke all on function public.claim_google_workspace_jobs(integer) from public, anon, authenticated;
revoke all on function public.finish_google_workspace_job(uuid,boolean,text,text) from public, anon, authenticated;
grant execute on function public.claim_google_workspace_jobs(integer) to service_role;
grant execute on function public.finish_google_workspace_job(uuid,boolean,text,text) to service_role;

-- Verification: inspect pg_policies, information_schema.routine_privileges, and
-- trigger definitions; test every role plus anon against the three browser RPCs.
-- Rollback must be a separately reviewed migration that drops the two triggers,
-- seven functions, four tables (jobs first), policies, and grants. Preserve job
-- history externally before rollback if it has operational value.
commit;
