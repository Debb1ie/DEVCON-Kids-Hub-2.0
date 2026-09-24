# Google Workspace automation

This review-only design uses a DEVCON-managed Google account and My Drive. Supabase remains the system of record. The browser can start or revoke authorization, but only Supabase Edge Functions receive OAuth callback codes, refresh tokens, client credentials, or the service-role key.

## Manual Google Cloud setup

1. Select the Google account designated by DEVCON to own the automation resources. For the current My Drive rollout, verify the existing folder owner's account during Google's consent screen; do not hardcode that email in the application.
2. In a DEVCON-controlled Google Cloud project, configure the OAuth consent screen and add the dedicated account as a test user while the app remains in testing.
3. Enable the Google Drive API and Google Sheets API.
4. Create a Web application OAuth client.
5. Add this exact authorized redirect URI, substituting the reviewed Supabase project origin: `https://<supabase-project-ref>.supabase.co/functions/v1/google-workspace-auth/callback`.
6. Create a My Drive root folder such as `DEVCON Kids Hub` while signed in as the dedicated account.
7. Create a central Sheet such as `DEVCON Kids Post Event Reports` and a `Post Event Reports` tab in the same account.
8. Configure the server-side secrets listed below and deploy the reviewed migration and Edge Functions only through a separately approved release.
9. A Super Admin opens **Integrations → Google Workspace**, selects **Connect Google account**, confirms the expected DEVCON account, then enters the My Drive root-folder and Sheet URLs/IDs.

The OAuth scopes are `openid`, `email`, Google Drive, and Google Sheets. Full Drive scope is required because the configured parent folder is an existing My Drive resource supplied by ID rather than a file created or selected through Google Picker. If a Picker-based workflow is introduced later, review whether `drive.file` can replace full Drive scope.

## Required Supabase secrets

Names only:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY` — base64-encoded 32 random bytes
- `GOOGLE_OAUTH_APP_ORIGIN` — the approved frontend origin used after the callback

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Never copy any of these values into React, Vite, Git, logs, SQL migrations, or user-visible errors.

## Authorization and token handling

Only a signed-in Super Admin can create a short-lived, single-use OAuth state or disconnect the account. Google returns the authorization code directly to `google-workspace-auth`. The function validates and consumes the hashed state, exchanges the code server-side, encrypts the refresh token with AES-256-GCM, and stores only ciphertext in `google_oauth_credentials`. That table has RLS enabled, no browser policies, and no browser grants. The UI receives only connection status and the connected account email.

Disconnect first calls Google's revocation endpoint. Credentials are deleted and both automations are disabled only after revocation succeeds. Connect, disconnect, configuration changes, and manual retries record safe audit actions without tokens or provider payloads.

## Workflow and reliability

- Creating an event does not create a Drive folder.
- The first valid report submission queues one `create_event_folder` job and one Sheet synchronization job when enabled.
- Folder naming is deterministic: `YYYY-MM-DD - Event Name`. The worker reuses the stored link or a matching child in the configured My Drive parent.
- Submission, revision request, resubmission, and approval queue Sheet synchronization. Stable row allocation in Supabase means retries update one row instead of appending duplicates.
- Participant and impact metrics remain blank until the report is approved. No attachment contents, Auth metadata, email address, credentials, or audit internals are exported. The attachment-link column remains blank pending a separately reviewed durable-link design.
- Provider failures never invalidate Supabase events or reports. Jobs retain a bounded safe error and attempt count.
- Only Super Admin can view jobs, requeue failures, or explicitly invoke processing. If scheduled invocation is unavailable, use **Process pending jobs**; never invoke the worker from an unauthenticated scheduler.

## Controlled deployment order

1. Review the final checksum and back up schema, data, policies, grants, functions, migration history, and protected row fingerprints.
2. Dry-run and apply only `20260910000300_google_workspace_automation.sql`.
3. Add the four OAuth secrets through Supabase secret management.
4. Deploy `google-workspace-auth` with platform JWT verification disabled because Google must reach its GET callback without a Supabase JWT; the function performs its own bearer/session and single-use state validation. Deploy `google-workspace-worker` with JWT verification enabled.
5. Verify anonymous and all six application roles before connecting Google.
6. Complete OAuth with the dedicated DEVCON account and verify the displayed account.
7. Configure My Drive/Sheet IDs, enable one automation at a time, and test with non-production fixtures.
8. Deploy a Vercel Preview separately after server-side verification. The new UI requires a frontend deployment, but none is authorized by this task.

## Rollback

Disable both toggles and finish or safely fail outstanding jobs. Disconnect to revoke Google access and remove the encrypted credential. Use a separately reviewed forward rollback migration to remove the queue trigger, RPCs, policies, grants, OAuth state/credential tables, and integration tables in dependency order. Export job/link history first if it has audit value. Do not delete My Drive folders or Sheet rows automatically; external records require an explicit operational decision.

## Future migration to Google Workspace and a Shared Drive

When DEVCON adopts Google Workspace, create a Shared Drive and grant the selected managed Workspace account the minimum role needed to create folders and update the reporting Sheet. Re-authorize the integration with that managed account; do not transfer or reuse the personal account's encrypted refresh credential.

Shared Drive support requires a separately reviewed application and database change. Add an explicit Drive ID setting, update Drive requests to use the Shared Drive parameters, and validate that the existing OAuth scopes remain appropriate. Preserve the current event-folder and Sheet-row identifiers during migration so retries remain idempotent. Move or copy existing My Drive resources only through a controlled reconciliation that verifies ownership, links, and row mappings; never silently replace stored IDs. After verification, revoke the personal-account connection and remove its credential through the existing disconnect workflow.
