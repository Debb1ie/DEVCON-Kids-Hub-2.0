-- REVIEW ONLY. Adds the approved Post Event Report export lifecycle; do not apply automatically.
begin;

-- Supersede the earlier lifecycle sync. Consolidated external reporting is now
-- queued only after approval; existing historical jobs remain auditable.
drop trigger if exists queue_google_report_sync_trigger on public.post_event_reports;

create table public.post_event_report_exports (
  report_id uuid primary key references public.post_event_reports(id) on delete cascade,
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  last_attempted_at timestamptz,
  completed_at timestamptz,
  safe_error_message text,
  drive_folder_id text,
  drive_folder_url text,
  final_export_file_id text,
  final_export_url text,
  sheet_row_reference text,
  uploaded_attachment_ids uuid[] not null default '{}',
  automation_version text not null default '1',
  initiated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint post_event_report_export_key check (idempotency_key = 'post_event_report:' || report_id::text)
);

create trigger post_event_report_exports_updated_at before update on public.post_event_report_exports
for each row execute function public.set_updated_at();

create or replace function public.queue_approved_report_export()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if new.status::text = 'approved' and old.status::text is distinct from 'approved' then
    insert into public.post_event_report_exports(report_id, idempotency_key, initiated_by)
    values (new.id, 'post_event_report:' || new.id::text, auth.uid())
    on conflict (report_id) do nothing;
    insert into public.audit_logs(actor_id, action, target_table, target_id, metadata)
    values (auth.uid(), 'REPORT_EXPORT_QUEUED', 'post_event_reports', new.id, jsonb_build_object('automation_version','1'));
  end if;
  return new;
end $$;

create trigger queue_approved_report_export_trigger after update of status on public.post_event_reports
for each row execute function public.queue_approved_report_export();

create or replace function public.request_report_export(check_report_id uuid)
returns public.post_event_report_exports language plpgsql security definer set search_path = pg_catalog, public as $$
declare result public.post_event_report_exports;
begin
  if not public.has_role(array['super_admin','admin','chapter_coordinator','event_coordinator'])
     or not public.can_access_report(check_report_id) then
    raise exception using errcode = '42501', message = 'You are not authorized to export this report.';
  end if;
  if not exists (select 1 from public.post_event_reports where id = check_report_id and status::text = 'approved') then
    raise exception using errcode = '22023', message = 'Only approved reports can be exported.';
  end if;
  insert into public.post_event_report_exports(report_id,idempotency_key,initiated_by)
  values(check_report_id,'post_event_report:' || check_report_id::text,auth.uid()) on conflict(report_id) do nothing;
  update public.post_event_report_exports set status = case when status='failed' and attempt_count < 5 then 'pending' else status end,
    safe_error_message = case when status='failed' and attempt_count < 5 then null else safe_error_message end,
    initiated_by = auth.uid()
  where report_id=check_report_id returning * into result;
  if result.status = 'failed' then raise exception using errcode='22023', message='This export reached its retry limit.'; end if;
  insert into public.audit_logs(actor_id,action,target_table,target_id) values(auth.uid(),'REPORT_EXPORT_REQUESTED','post_event_reports',check_report_id);
  return result;
end $$;

alter table public.post_event_report_exports enable row level security;
create policy post_event_report_exports_select on public.post_event_report_exports for select to authenticated
using (public.can_access_report(report_id) and public.has_role(array['super_admin','admin','chapter_coordinator','event_coordinator']));
revoke all on public.post_event_report_exports from public,anon,authenticated;
grant select on public.post_event_report_exports to authenticated;
grant all on public.post_event_report_exports to service_role;
revoke all on function public.queue_approved_report_export() from public,anon,authenticated;
revoke all on function public.request_report_export(uuid) from public,anon;
grant execute on function public.request_report_export(uuid) to authenticated;
commit;
