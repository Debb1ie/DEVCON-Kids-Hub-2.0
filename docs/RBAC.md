# DEVCON Kids Hub Role-Based Access Control

This document is the authoritative application permission specification. UI visibility is usability only; Supabase RLS, constrained RPCs, triggers, foreign keys, and unique constraints are the enforcement boundary. All unlisted access is denied.

## Permission vocabulary

- `none`: no access.
- `own`: only records owned by `auth.uid()`.
- `assigned_event`: only an event with an active `event_assignments` row for `auth.uid()`.
- `own_chapter`: only rows whose `chapter_id` equals the actor's assigned chapter or Volunteer Community.
- `nationwide`: all operational chapters and events.
- `platform`: ownership/security configuration across the platform.

Missing and unknown roles are treated as `pending_volunteer`. A user may never rely on a role sent by the browser.

## Roles and hierarchy

1. `super_admin` — platform ownership plus nationwide operations.
2. `admin` — nationwide operations, excluding ownership and administrative-role assignment.
3. `chapter_coordinator` — own-chapter operations.
4. `event_coordinator` — explicitly assigned-event operations.
5. `volunteer` — own profile, onboarding, applications, assignments, tasks, requests, and approved volunteer content.
6. `pending_volunteer` — identity and sign-out only.

Hierarchy never removes record-scope, self-action, final-Super-Admin, report-review, or audit requirements.

## Feature permission matrix

| Feature | Super Admin | Admin | Chapter Coordinator | Event Coordinator | Volunteer | Pending Volunteer |
|---|---|---|---|---|---|---|
| Dashboard | nationwide | nationwide | own_chapter | none | none | none |
| Chapters | nationwide manage | nationwide manage | own_chapter update-safe | assigned_event read | none | none |
| Volunteers | nationwide manage | nationwide manage | own_chapter manage | assigned_event accepted/applicants only | own | none |
| Events | nationwide manage | nationwide manage | own_chapter manage | assigned_event update | published/open browse | none |
| Event applications | nationwide decide | nationwide decide | own_chapter decide | assigned_event decide | own apply/withdraw | none |
| Inventory | nationwide manage | nationwide manage | own_chapter manage | assigned_event allocation/request | own requests | none |
| Reports | nationwide manage/review | nationwide manage/review | own_chapter create/edit/submit/revision | assigned_event create/edit/submit | none | none |
| Social media | nationwide | nationwide | own_chapter | assigned_event | none | none |
| Knowledge/FAQ read | nationwide | nationwide | approved content | approved content | approved content | none |
| Knowledge/FAQ manage | platform | nationwide | none | none | none | none |
| AI settings | platform | none | none | none | none | none |
| Audit logs | platform | nationwide if safely filtered | none | none | none | none |
| User roles | platform | non-admin targets/roles | none | none | none | none |

## Route matrix

| Route | SA | Admin | Chapter | Event | Volunteer | Pending |
|---|---:|---:|---:|---:|---:|---:|
| `/dashboard` | nationwide | nationwide | own_chapter | none | none | none |
| `/dashboard/chapters` | nationwide | nationwide | own_chapter | assigned_event | none | none |
| `/dashboard/volunteers` | nationwide | nationwide | own_chapter | none | none | none |
| `/dashboard/events` | nationwide | nationwide | own_chapter | assigned_event | own/application view | none |
| `/dashboard/inventory` | nationwide | nationwide | own_chapter | assigned_event | none (dedicated own-request UI deferred) | none |
| `/dashboard/post-event-report` | nationwide | nationwide | own_chapter | assigned_event | none | none |
| `/dashboard/event-checklist` | nationwide | nationwide | own_chapter | assigned_event | none (own-task UI deferred) | none |
| `/dashboard/social-media` | nationwide | nationwide | own_chapter | assigned_event | none | none |
| `/dashboard/knowledge-base` | nationwide | nationwide | own_chapter read | assigned_event read | own/read | none |
| `/dashboard/users`, `/dashboard/admin`, `/dashboard/faq-suggestions` | platform | nationwide | none | none | none | none |
| `/dashboard/ai-settings`, `/dashboard/settings` | platform | none | none | none | none | none |

Routes, sidebar links, dashboard quick actions, page actions, and services must consume the centralized registry in `src/auth/permissions.js`. Role changes re-render the guards; unauthorized routes redirect to the role's safe default. Pending users always go to `/pending-approval`.

## Sensitive actions

| Action | Super Admin | Admin | Chapter Coordinator | Event Coordinator | Volunteer |
|---|---|---|---|---|---|
| Create/delete chapter | nationwide | nationwide | none | none | none |
| Update chapter | nationwide | nationwide | own_chapter non-security fields | none | none |
| Create event | nationwide | nationwide | own_chapter | none | none |
| Update event | nationwide | nationwide | own_chapter | assigned_event operational fields | none |
| Delete event | nationwide | nationwide | own_chapter | none | none |
| Apply/withdraw application | none | none | none | none | own pending |
| Decide application | nationwide | nationwide | own_chapter | assigned_event | none |
| Manage inventory | nationwide | nationwide | own_chapter | none | none |
| Submit inventory request | optional | optional | optional | assigned_event | own |
| Approve inventory request | nationwide | nationwide | own_chapter | none | none |
| Approve/archive report | nationwide, not own | nationwide, not own | none | none | none |
| Request report revision | nationwide | nationwide | own_chapter | none | none |
| Manage knowledge/FAQ | platform | nationwide | none | none | none |
| Change Admin/Super Admin | platform safety rules | none | none | none | none |

## Event-application workflow

`pending → accepted|rejected|withdrawn`. Only an exact `volunteer` may apply. The event must be published, applications-open, scheduled, before its deadline, and below capacity. `(event_id, volunteer_user_id)` remains unique for permanent history. A Volunteer may return their own `withdrawn` row to `pending` only while the event remains eligible. A rejected applicant cannot self-reapply; an authorized reviewer may reopen `rejected → pending`, producing one audit entry. Volunteers see only their applications and may withdraw only their own `pending` application. Decisions require an assigned Event Coordinator, own-chapter Chapter Coordinator, Admin, or Super Admin, and record `decided_by`, `decided_at`, and exactly one audit entry. Volunteers cannot insert assignments or accepted states.

## Post Event Report workflow

Chapter Coordinators operate on own-chapter reports; Event Coordinators operate on assigned events. Draft and `needs_revision` reports are editable by authorized submitters. Submitted reports are read-only until revision is requested. Admin/Super Admin may request revision, approve another user's report, and archive according to policy. A submitter can never approve their own report. Approved/archived reports and attachments are immutable. Upload intents and private paths remain mandatory.

## Inventory-request workflow

Volunteers create/read only their own request; Event Coordinators do so only for assigned-event allocations. Chapter Coordinators review own-chapter requests. Admin/Super Admin review nationwide. Requesters cannot approve their request. Decision actor/time and audit records are required before this workflow is production-ready.

## User, chapter, and event assignment rules

- Super Admin cannot change their own role/chapter or remove the final Super Admin.
- Admin cannot modify Admin/Super Admin or assign administrative roles.
- Users cannot self-assign roles, chapters, communities, or events.
- Chapter-scoped roles require a valid active UUID directory record.
- Event Coordinators require an explicit assignment created by an authorized actor; chapter membership or event creator alone is insufficient.
- No destructive user deletion is provided.

## Audit requirements

Role changes, event assignments, application decisions, report review transitions, and inventory decisions are server-side audited. Audit rows derive the actor from `auth.uid()`. The browser cannot choose the actor, create arbitrary audit rows, or suppress required auditing.

## Frontend and service behavior

The frontend denies unknown roles, hides unavailable routes/actions, explains disabled actions when useful, and never interprets hiding as enforcement. Services use the authenticated Supabase client only, call constrained RPCs for sensitive transitions, distinguish forbidden/conflict/validation/network errors, and never persist mock mutations after a server failure. No browser bundle may contain service-role, database, provider, or OAuth-client secrets.

## Database enforcement and tests

RLS must scope every table by `auth.uid()`, chapter, or assignment. Security-definer functions use a fixed search path, validate the actor internally, revoke `PUBLIC`/`anon`, and expose minimum grants. Tests cover anonymous, missing/unknown/pending roles; every route; self/final-admin restrictions; cross-chapter and unassigned-event denial; event eligibility, capacity, duplicates, withdrawal, decisions, and auditing; report reviewer separation; and inventory ownership/review.

## Prototype and implementation gaps

| Feature | Prototype | Current frontend/service | Current database | Final decision | Required fix |
|---|---|---|---|---|---|
| Chapter dashboard | Shows nationwide metrics/actions | Mock nationwide dashboard | Broad reads | own_chapter | Scope data and quick actions |
| Event Coordinator | Shows chapter events and Create Event | Previously generic events CRUD | chapter/creator policies | assigned_event; no create | Central guard + assignment RLS |
| Volunteer events | Open-event cards and Apply buttons | RPC-backed discovery, application, withdrawal, and scoped review UI | Review-only application migration | own applications/scoped review | Controlled migration deployment approval |
| Pending user | Isolated approval page | Implemented | pending role exists | identity/sign-out only | Keep deny-default |
| Profiles | Not explicit | Some broad lists | `profiles_select USING(true)` | own/admin/scoped manager | Harden RLS/RPC |
| Chapters | Nationwide admin table | Direct table CRUD | public authenticated read | approved-role scopes | Harden policy and safe updates |
| Reports | Five-step form | Local/remote-guarded service | MVP migration local only | chapter/assignment scope | Deploy report migration before RBAC migration |
| Inventory requests | Mentions approval flow | No complete own-request UI | Basic table lacks decision actor/time | own + scoped review | Add later CRUD/migration |
| Knowledge/FAQ | Admin controls | Direct table writes | several `USING/WITH CHECK(true)` policies | admin manage; approved read | Harden RLS |
| API Keys/Danger Zone | Visible in prototype | Not copied | N/A | never expose raw secrets | Keep server-side only |

## Deferred features and change control

Deferred: event allocations, own-profile editor, onboarding UI, inventory-request decision metadata/UI, filtered audit-log UI, and secure server-side AI provider configuration. Inventory requests are the highest-priority CRUD feature after the event-application migrations receive controlled deployment approval.

## Team Preview UAT checklist

Use a Vercel Preview deployment and separate lower-role accounts; do not grant another tester Super Admin solely for UAT.

1. Super Admin signs in and sees nationwide navigation.
2. A new team member signs in and reaches Pending Approval.
3. Super Admin approves that account as Volunteer.
4. Volunteer signs in again and sees published, open events.
5. Volunteer applies to an eligible event and sees `pending`.
6. Assigned Event Coordinator sees only the assigned event and its application.
7. Event Coordinator accepts or rejects after confirmation.
8. Volunteer sees the updated application status.
9. Chapter Coordinator can review their chapter events but not another chapter.
10. Admin can perform nationwide operations but cannot manage Admin or Super Admin assignments.
11. Pending Volunteer remains unable to access dashboard routes or protected RPCs.
12. Direct URL attempts for unauthorized pages redirect to the role's safe destination.
13. Confirm mobile application cards, filters, confirmation dialog, loading, empty, success, and error states.

Any permission change requires updating this document, the registry, route/sidebar/action tests, service tests, and RLS/RPC tests together. Database migrations remain review-only until separately backed up, dry-run, approved, applied, and verified. Never weaken RLS to accommodate a frontend shortcut.
