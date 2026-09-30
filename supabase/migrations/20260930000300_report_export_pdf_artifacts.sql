-- REVIEW ONLY. Do not apply without explicit approval.
-- Adds the checkpoint columns the report-export worker needs for the
-- Post Event Report PDF and the Attachments subfolder. Apply BEFORE deploying
-- the updated report-export Edge Function. Safe to re-run.

begin;

alter table public.post_event_report_exports
  add column if not exists pdf_file_id text,
  add column if not exists pdf_url text,
  add column if not exists attachments_folder_id text;

comment on column public.post_event_report_exports.pdf_file_id is
  'Drive file ID of "Post Event Report.pdf". Set once; retries reuse it instead of creating a duplicate.';
comment on column public.post_event_report_exports.attachments_folder_id is
  'Drive folder ID of the Attachments subfolder. Only created when a report has attachments.';

commit;

-- Optional backfill, run separately after deploying the new worker, so reports
-- exported before this change receive their PDF and upgraded tracker row. The
-- worker reuses the existing folder, JSON file and attachments, then adds only
-- the missing PDF.
--
-- update public.post_event_report_exports
-- set status = 'pending', attempt_count = 0, safe_error_message = null
-- where status = 'completed' and pdf_file_id is null;
--
-- Rollback:
-- alter table public.post_event_report_exports
--   drop column if exists attachments_folder_id,
--   drop column if exists pdf_url,
--   drop column if exists pdf_file_id;
