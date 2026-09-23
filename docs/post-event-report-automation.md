# Post Event Report automation

Approved reports are queued by a database trigger and exported by the authenticated `report-export` Supabase Edge Function. The browser never receives the Supabase service-role key, Google OAuth refresh token, access token, or private Storage object credentials.

## Lifecycle and authorization

`post_event_report_exports` is the durable checkpoint and audit-facing record. Its states are `pending`, `processing`, `completed`, and `failed`; attempts are capped at five. Approval creates one record using the unique key `post_event_report:{report_id}`. A repeated request returns the completed record, while a failed record can be returned to `pending` until the retry cap is reached.

The request RPC requires an authenticated `super_admin`, `admin`, `chapter_coordinator`, or `event_coordinator` and also calls the existing `can_access_report` helper. This retains national, chapter, and assigned-event scope. Pending volunteers and unrelated chapter users are rejected. RLS uses the same check for status and external-link reads.

Every queue, request, start, completion, and safe failure is written to `audit_logs`. Provider errors are replaced with a generic message; tokens, headers, keys, and Storage signed URLs are never logged.

## Drive and Sheets

Folders are found or created under the configured Drive root:

`Post Event Reports/{year}/{chapter}/{date}_{chapter}_{event}_{report-id}`

Names are sanitized and the report UUID preserves uniqueness. The function upserts a versioned JSON final export, then copies each private attachment server-side. Drive `appProperties.devconKey` values prevent duplicate report files and attachment files. Successful attachment IDs are checkpointed so a retry resumes after the last successful copy.

The configured worksheet receives one stable row per report with: report ID, event ID/name, chapter/date, submitter/approver, registration/attendance/learner/volunteer figures, satisfaction, budget, expenses, balance, report/export states, Drive IDs, approval time, and export time. Missing schema values remain blank rather than being fabricated.

The JSON artifact is the initial server-generated final-report representation. Its normalized sections make a later HTML-to-PDF renderer straightforward without changing the workflow contract.

## Server configuration

Deploy the existing Google OAuth functions and the new `report-export` function, apply migrations through `20260923000100_approved_report_exports.sql`, and configure these Edge Function secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY`

In the Super Admin Integration Settings page, connect the controlled Google account and provide the Drive root folder, Spreadsheet, and worksheet tab. Grant that account editor access to both destinations and enable Google Drive API and Google Sheets API in its Cloud project.

For local logic tests, no Google credentials are required: `tests/report-export-automation.test.mjs` uses an in-memory provider. The local Supabase integration test remains optional and requires a separately running local stack. No migration or deployment is performed by the test suite.

Automatic approval queues work immediately after the migration. Execution is currently initiated by the approved-report action in the UI; a later trusted scheduler may invoke the same Edge Function or a service-only batch entry point without changing export semantics.
