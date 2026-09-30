-- REVIEW ONLY: strict Post Event Report author/reviewer role separation.
-- Do not apply automatically. Apply through the normal reviewed migration process.
begin;

create or replace function public.can_access_report(check_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.post_event_reports r
    where r.id = check_report_id
      and (
        (
          public.has_role(array['super_admin', 'admin'])
          and r.status in ('submitted', 'needs_revision', 'approved', 'archived')
        )
        or (
          r.submitted_by = auth.uid()
          and public.has_role(array['event_coordinator'])
          and exists (
            select 1
            from public.event_assignments ea
            where ea.event_id = r.event_id
              and ea.user_id = auth.uid()
              and ea.assignment_role = 'event_coordinator'
          )
        )
      )
  );
$function$;

create or replace function public.can_edit_report(check_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.post_event_reports r
    where r.id = check_report_id
      and r.submitted_by = auth.uid()
      and r.status in ('draft', 'needs_revision')
      and public.has_role(array['event_coordinator'])
      and exists (
        select 1
        from public.event_assignments ea
        where ea.event_id = r.event_id
          and ea.user_id = auth.uid()
          and ea.assignment_role = 'event_coordinator'
      )
  );
$function$;

create or replace function public.can_request_report_revision(check_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.post_event_reports r
    where r.id = check_report_id
      and r.status = 'submitted'
      and r.submitted_by <> auth.uid()
      and public.has_role(array['super_admin', 'admin'])
  );
$function$;

drop policy if exists reports_insert_mvp on public.post_event_reports;
create policy reports_insert_mvp on public.post_event_reports
for insert to authenticated
with check (
  submitted_by = auth.uid()
  and status = 'draft'
  and public.has_role(array['event_coordinator'])
  and exists (
    select 1
    from public.event_assignments ea
    where ea.event_id = post_event_reports.event_id
      and ea.user_id = auth.uid()
      and ea.assignment_role = 'event_coordinator'
  )
);

-- Existing report and child-table update policies call can_edit_report, so the
-- helper replacement above removes Admin/Super Admin draft editing everywhere.
-- Existing transition validation continues to permit only author submission and
-- Admin/Super Admin revision/approval transitions.

commit;

-- Rollback: restore the three helper definitions and reports_insert_mvp policy
-- from 20260909000100_post_event_report_mvp.sql after confirming no newer
-- migration depends on these stricter semantics.
