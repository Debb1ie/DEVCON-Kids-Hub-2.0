# Post Event Report MVP integration notes

The `/app/post-event-report` route is the database-backed five-step workflow. Its repository refuses non-loopback Supabase URLs while the feature is under local integration testing. Drafts, normalized report details, workflow transitions, upload intents, private attachments, and signed previews use the schema proposed by `20260909000100_post_event_report_mvp.sql`.

## Existing Events modal overlap

`src/pages/Events.jsx` still contains the earlier post-event report modal. It gathers summary, attendance, expense, and file fields in component state and displays a submitted summary, but it does not persist to the normalized report schema or private Storage workflow. It remains intentionally available for compatibility and has not been removed. Until a separately approved cleanup, users can encounter both the legacy modal from Events and the new routed workflow; the routed workflow is the MVP integration target.

## Deferred items

- OCR remains disabled and `ocr_data` remains a compatibility field.
- Google Drive and Google Sheets automation are not connected.
- Expired, abandoned upload-intent object cleanup still requires a trusted scheduled worker before production deployment.
- Remote database deployment and frontend production enablement require separate approval.
