# Google Workspace automation

This review-only design keeps Supabase as the system of record. Event creation and Post Event Report transitions enqueue durable jobs; they never call Google from a database trigger or browser. The `google-workspace-worker` Edge Function claims jobs and performs idempotent Drive and Sheets operations. A failed provider operation does not invalidate an event or report.

## Manual Google setup

1. Create or select the DEVCON Google Shared Drive.
2. Create a root folder such as `DEVCON Kids Hub`.
3. Create a central Sheet such as `DEVCON Kids Post Event Reports` and a `Post Event Reports` tab.
4. In Google Cloud, enable the Google Drive API and Google Sheets API.
5. Create a dedicated service account. Add it to the Shared Drive with the least privilege that can create folders (normally Content Manager).
6. Share the central Sheet with the service account as Editor.
7. Store the credential JSON only as the Supabase Edge Function secret named `GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON`.

Never put the service-account credential, a Google OAuth token, an API key, or the Supabase service-role key in Vite, React, Git, logs, or database configuration. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are provided to deployed Supabase Edge Functions by the platform and must remain server-side.

## Configuration and access

After the migration and function are separately reviewed and deployed, a Super Admin opens **Integrations → Google Workspace** and enters the Shared Drive root-folder URL/ID, Sheet URL/ID, feature toggles, and optional tab name. The guarded RPC validates and stores normalized, non-secret IDs. All other roles and anonymous callers are denied by route permissions, service checks, RPC authorization, grants, and RLS.

The Sheet contains event name/date/chapter, report status, submitter display name, submission/approval timestamps, approved attendance/impact metrics, and the event folder link. The attachment-link column remains blank until a separately reviewed durable, authorization-safe link design exists. No attachment contents, Auth metadata, email address, credentials, or audit internals are exported.

## Reliability and retries

- Event folder idempotency key: one stable key per event. The worker also searches the configured parent for the deterministic `YYYY-MM-DD - Event Name` folder before creation.
- Report jobs are queued for submitted, needs-revision, and approved transitions. `google_workspace_report_syncs` stores the Sheet row range, so later jobs update the same row.
- Job states are `pending`, `processing`, `succeeded`, and `failed`; attempts and a bounded safe error are retained.
- Only a Super Admin can requeue a failed job or invoke the worker explicitly. Configuration changes and manual retries create safe audit rows.
- If scheduled Edge Function invocation is unavailable on the selected plan, use the Super-Admin-only **Process pending jobs** action. Do not expose a service credential to a scheduler or browser.

## Controlled deployment order

1. Back up schema, data, policies, functions, grants, migration history, and protected row fingerprints.
2. Apply `20260910000300_google_workspace_automation.sql` in an isolated release workspace after exact dry-run verification.
3. Set `GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON` through Supabase secret management (never through SQL or frontend environment variables).
4. Deploy `google-workspace-worker` with JWT verification enabled.
5. Run anonymous and six-role authorization checks before enabling either setting.
6. Configure real resource IDs as Super Admin, enable one automation at a time, and observe the first jobs.
7. Deploy a Vercel Preview only after the database and function deployment are verified; the UI change requires a new frontend build but no production deployment during this task.

## Rollback considerations

Disable both toggles first and allow or safely fail outstanding jobs. Use a separately reviewed forward rollback migration to remove triggers, RPCs, policies, grants, and tables in dependency order. Export job/link history if it has audit value. Remove the Edge Function and secret only after database automation is disabled. Never delete Google folders or Sheet rows automatically during rollback; those externally owned records require an explicit operational decision.
