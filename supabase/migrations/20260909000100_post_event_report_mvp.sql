-- DEVCON Kids Hub: Post Event Report MVP
-- REVIEW-ONLY MIGRATION DRAFT. DO NOT APPLY UNTIL SEPARATELY APPROVED.
--
-- This draft was prepared against the authoritative live schema on 2026-09-09.
-- It deliberately preserves public.post_event_reports.ocr_data and finalized.
-- Migration-history reconciliation is deferred and must happen before execution.

begin;

-- -----------------------------------------------------------------------------
-- 1. Preflight: fail loudly if the authoritative dependencies have drifted.
--    Do not replace these checks with broad IF NOT EXISTS clauses; a partial or
--    differently-shaped object must be reviewed, not silently accepted.
-- -----------------------------------------------------------------------------

do $preflight$
declare
  proposed_relation text;
  proposed_function text;
begin
  if to_regclass('public.post_event_reports') is null
     or to_regclass('public.events') is null
     or to_regclass('public.chapters') is null
     or to_regclass('public.user_roles') is null then
    raise exception 'Preflight failed: a required existing public table is missing';
  end if;

  if to_regclass('storage.buckets') is null
     or to_regclass('storage.objects') is null then
    raise exception 'Preflight failed: required Storage tables are missing';
  end if;

  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'app_role'
  ) then
    raise exception 'Preflight failed: public.app_role is missing';
  end if;

  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'app_role'
    group by t.oid
    having array_agg(e.enumlabel order by e.enumsortorder) = array[
      'super_admin', 'admin', 'chapter_coordinator',
      'event_coordinator', 'volunteer', 'pending_volunteer'
    ]::name[]
  ) then
    raise exception 'Preflight failed: public.app_role values differ from the reviewed schema';
  end if;

  if to_regprocedure('public.has_role(text[])') is null
     or to_regprocedure('public.is_chapter_member(uuid,text[])') is null then
    raise exception 'Preflight failed: reviewed authorization helpers are missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'on_auth_user_created' and not tgisinternal
  ) then
    raise exception 'Preflight failed: on_auth_user_created trigger is missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'post_event_reports'
      and column_name = 'ocr_data'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'post_event_reports'
      and column_name = 'finalized'
  ) then
    raise exception 'Preflight failed: legacy report columns differ from the reviewed schema';
  end if;

  if exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'post_event_report_status'
  ) then
    raise exception 'Preflight failed: public.post_event_report_status already exists';
  end if;

  foreach proposed_relation in array array[
    'event_assignments',
    'post_event_report_attendance',
    'post_event_report_impact',
    'post_event_report_finance',
    'post_event_report_transactions',
    'post_event_report_upload_intents',
    'post_event_report_attachments',
    'post_event_report_transaction_attachments',
    'post_event_report_reviews'
  ] loop
    if to_regclass('public.' || proposed_relation) is not null then
      raise exception 'Preflight failed: public.% already exists', proposed_relation;
    end if;
  end loop;

  foreach proposed_function in array array[
    'public.can_access_report(uuid)',
    'public.can_edit_report(uuid)',
    'public.can_request_report_revision(uuid)',
    'public.can_approve_report(uuid)',
    'public.set_updated_at()',
    'public.initialize_report_workflow()',
    'public.prepare_report_upload_intent()',
    'public.validate_report_attachment()',
    'public.consume_report_upload_intent()',
    'public.validate_transaction_attachment()',
    'public.protect_report_child_write()',
    'public.validate_report_transition()'
  ] loop
    if to_regprocedure(proposed_function) is not null then
      raise exception 'Preflight failed: function % already exists', proposed_function;
    end if;
  end loop;

  if exists (
    select 1 from pg_policies
    where policyname in (
      'reports_select_mvp', 'reports_insert_mvp', 'reports_update_mvp',
      'event_assignments_select_mvp', 'event_assignments_insert_mvp',
      'event_assignments_update_mvp', 'event_assignments_delete_mvp',
      'report_objects_select_mvp', 'report_objects_insert_mvp',
      'report_objects_delete_mvp'
    )
  ) then
    raise exception 'Preflight failed: one or more proposed MVP policies already exist';
  end if;

  if exists (
    select 1 from pg_trigger
    where not tgisinternal and tgname in (
      'report_attendance_updated_at', 'report_impact_updated_at',
      'report_finance_updated_at', 'report_transactions_updated_at',
      'initialize_report_workflow_trigger',
      'prepare_report_upload_intent_trigger',
      'validate_report_attachment_trigger',
      'consume_report_upload_intent_trigger',
      'validate_transaction_attachment_trigger', 'protect_attendance_write',
      'protect_impact_write', 'protect_finance_write',
      'protect_transaction_write', 'protect_attachment_write',
      'validate_report_transition_trigger'
    )
  ) then
    raise exception 'Preflight failed: one or more proposed MVP triggers already exist';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'post_event_reports'
      and column_name in (
        'status', 'venue', 'coordinator_name', 'event_summary', 'reviewed_by',
        'review_notes', 'revision_reason', 'revision_requested_at', 'updated_at',
        'submitted_at', 'approved_at', 'archived_at'
      )
  ) then
    raise exception 'Preflight failed: one or more proposed report columns already exist';
  end if;

  if exists (
    select 1 from storage.buckets where id = 'event-report-attachments'
  ) then
    raise exception 'Preflight failed: event-report-attachments bucket already exists';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.post_event_reports'::regclass
      and conname = 'post_event_reports_event_id_fkey'
      and contype = 'f'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.post_event_reports'::regclass
      and conname = 'post_event_reports_submitted_by_fkey'
      and contype = 'f'
  ) then
    raise exception 'Preflight failed: reviewed report foreign keys have changed';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'post_event_reports'
      and policyname = 'reports_select'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'post_event_reports'
      and policyname = 'reports_insert'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'post_event_reports'
      and policyname = 'reports_update'
  ) then
    raise exception 'Preflight failed: reviewed legacy report policies have changed';
  end if;
end
$preflight$;

-- Duplicate detection is repeated inside the migration so execution aborts if
-- rows are added after review. No report is deleted, merged, or selected as a
-- winner automatically.
do $duplicates$
begin
  if exists (
    select event_id
    from public.post_event_reports
    group by event_id
    having count(*) > 1
  ) then
    raise exception 'Preflight failed: duplicate post_event_reports.event_id values exist';
  end if;
end
$duplicates$;

-- -----------------------------------------------------------------------------
-- 2. Status and additive report fields.
-- -----------------------------------------------------------------------------

create type public.post_event_report_status as enum (
  'draft',
  'submitted',
  'needs_revision',
  'approved',
  'archived'
);

alter table public.post_event_reports
  add column status public.post_event_report_status not null default 'draft',
  add column venue text,
  add column coordinator_name text,
  add column event_summary text,
  add column reviewed_by uuid references auth.users(id) on delete set null,
  add column review_notes text,
  add column revision_reason text,
  add column revision_requested_at timestamptz,
  add column updated_at timestamptz not null default now(),
  add column submitted_at timestamptz,
  add column approved_at timestamptz,
  add column archived_at timestamptz;

comment on column public.post_event_reports.ocr_data is
  'Legacy compatibility field. OCR remains deferred for the MVP.';
comment on column public.post_event_reports.finalized is
  'Legacy compatibility field maintained from report status; not proof of administrative approval.';

-- Conservative legacy mapping: finalized=true means submitted, never approved.
update public.post_event_reports
set status = case
      when finalized then 'submitted'::public.post_event_report_status
      else 'draft'::public.post_event_report_status
    end,
    submitted_at = case
      when finalized then coalesce(submitted_at, created_at)
      else submitted_at
    end;

-- The live recheck found zero duplicate event IDs. The preflight above protects
-- against new duplicates appearing between review and eventual execution.
alter table public.post_event_reports
  add constraint post_event_reports_event_id_unique unique (event_id);

-- -----------------------------------------------------------------------------
-- 3. Normalized MVP tables.
-- -----------------------------------------------------------------------------

create table public.event_assignments (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assignment_role public.app_role not null,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id, assignment_role),
  constraint event_assignments_role_check check (
    assignment_role = 'event_coordinator'
  ),
  constraint event_assignments_no_self_assignment check (user_id <> assigned_by)
);

create table public.post_event_report_attendance (
  report_id uuid primary key references public.post_event_reports(id) on delete cascade,
  registered_count integer not null default 0 check (registered_count >= 0),
  attended_count integer not null default 0 check (attended_count >= 0),
  children_reached integer not null default 0 check (children_reached >= 0),
  volunteers_involved integer not null default 0 check (volunteers_involved >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_attendance_consistency check (attended_count <= registered_count)
);

create table public.post_event_report_impact (
  report_id uuid primary key references public.post_event_reports(id) on delete cascade,
  key_learnings text not null check (btrim(key_learnings) <> ''),
  challenges text,
  community_impact text not null check (btrim(community_impact) <> ''),
  recommendations text,
  satisfaction_rating text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_satisfaction_rating_check check (
    satisfaction_rating is null
    or satisfaction_rating in ('excellent', 'good', 'fair', 'poor')
  )
);

create table public.post_event_report_finance (
  report_id uuid primary key references public.post_event_reports(id) on delete cascade,
  currency_code char(3) not null default 'PHP',
  approved_budget numeric(14,2) not null default 0 check (approved_budget >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.post_event_report_transactions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.post_event_reports(id) on delete cascade,
  transaction_date date,
  vendor_payee text,
  description text not null check (btrim(description) <> ''),
  expense_category text not null,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text,
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_expense_category_check check (
    expense_category in ('venue', 'food', 'transport', 'materials', 'other')
  ),
  constraint report_payment_method_check check (
    payment_method is null
    or payment_method in ('cash', 'bank_transfer', 'card', 'e_wallet', 'other')
  )
);

-- Upload intents solve the upload-before-metadata lifecycle safely:
-- 1) an authorized user creates an intent and receives a server-derived path;
-- 2) Storage INSERT is permitted only for that short-lived path;
-- 3) permanent metadata is inserted only after storage.objects contains the file;
-- 4) a used_at marker closes the intent;
-- 5) an unused, unexpired intent permits client cleanup if metadata insertion fails.
-- Expired abandoned objects must be removed by a separately approved trusted
-- cleanup worker using the Storage API; this migration does not deploy a worker.
create table public.post_event_report_upload_intents (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.post_event_reports(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  category text not null,
  original_file_name text not null check (btrim(original_file_name) <> ''),
  safe_file_name text not null,
  storage_bucket text not null default 'event-report-attachments',
  storage_path text not null unique,
  expected_content_type text not null,
  expected_size bigint not null check (expected_size > 0 and expected_size <= 26214400),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  used_at timestamptz,
  constraint report_upload_intent_category_check check (
    category in (
      'event_photo', 'event_documentation', 'attendance',
      'finance_support', 'impact_report'
    )
  ),
  constraint report_upload_intent_mime_check check (
    expected_content_type in (
      'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
    )
  ),
  constraint report_upload_intent_expiry_check check (expires_at > created_at)
);

create table public.post_event_report_attachments (
  id uuid primary key,
  upload_intent_id uuid not null unique
    references public.post_event_report_upload_intents(id) on delete restrict,
  report_id uuid not null references public.post_event_reports(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  storage_bucket text not null,
  storage_path text not null,
  file_name text not null check (btrim(file_name) <> ''),
  file_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 26214400),
  category text not null,
  caption text,
  uploaded_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path),
  constraint report_attachment_category_check check (
    category in (
      'event_photo', 'event_documentation', 'attendance',
      'finance_support', 'impact_report'
    )
  ),
  constraint report_attachment_mime_check check (
    file_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  )
);

create table public.post_event_report_transaction_attachments (
  transaction_id uuid not null
    references public.post_event_report_transactions(id) on delete cascade,
  attachment_id uuid not null
    references public.post_event_report_attachments(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (transaction_id, attachment_id)
);

create table public.post_event_report_reviews (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.post_event_reports(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  from_status public.post_event_report_status not null,
  to_status public.post_event_report_status not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint report_reviews_actual_transition check (from_status <> to_status)
);

create index event_assignments_user_event_idx
  on public.event_assignments(user_id, event_id);
create index report_transactions_report_idx
  on public.post_event_report_transactions(report_id);
create index report_upload_intents_report_idx
  on public.post_event_report_upload_intents(report_id, expires_at);
create index report_attachments_report_idx
  on public.post_event_report_attachments(report_id);
create index report_reviews_report_created_idx
  on public.post_event_report_reviews(report_id, created_at);

-- -----------------------------------------------------------------------------
-- 4. Authorization helpers. All are SECURITY DEFINER with an empty search_path,
--    are unavailable to anon, and expose only boolean authorization decisions.
-- -----------------------------------------------------------------------------

-- The authoritative baseline defines these helpers without SECURITY DEFINER.
-- Since user_roles RLS itself calls has_role(), invoker execution recursively
-- re-enters that policy. Harden the existing signatures before MVP policies use
-- them. This is a security correction, not a new role-assignment capability.
create or replace function public.has_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role::text = any(allowed_roles)
  );
$function$;

create or replace function public.is_chapter_member(
  check_chapter_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and chapter_id = check_chapter_id
      and role::text = any(allowed_roles)
  );
$function$;

revoke all on function public.has_role(text[]) from public, anon;
revoke all on function public.is_chapter_member(uuid, text[]) from public, anon;
grant execute on function public.has_role(text[]) to authenticated;
grant execute on function public.is_chapter_member(uuid, text[]) to authenticated;

create function public.can_access_report(check_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.post_event_reports r
    join public.events e on e.id = r.event_id
    where r.id = check_report_id
      and (
        public.has_role(array['super_admin', 'admin'])
        or public.is_chapter_member(e.chapter_id, array['chapter_coordinator'])
        or exists (
          select 1
          from public.event_assignments ea
          where ea.event_id = r.event_id
            and ea.user_id = auth.uid()
            and ea.assignment_role = 'event_coordinator'
        )
      )
  );
$function$;

create function public.can_edit_report(check_report_id uuid)
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
      and r.status in ('draft', 'needs_revision')
      and public.can_access_report(r.id)
  );
$function$;

create function public.can_request_report_revision(check_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.post_event_reports r
    join public.events e on e.id = r.event_id
    where r.id = check_report_id
      and r.status = 'submitted'
      and r.submitted_by <> auth.uid()
      and (
        public.has_role(array['super_admin', 'admin'])
        or public.is_chapter_member(e.chapter_id, array['chapter_coordinator'])
      )
  );
$function$;

create function public.can_approve_report(check_report_id uuid)
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
      and r.status = 'submitted'
      and r.submitted_by <> auth.uid()
      and public.has_role(array['super_admin', 'admin'])
  );
$function$;

revoke all on function public.can_access_report(uuid) from public;
revoke all on function public.can_edit_report(uuid) from public;
revoke all on function public.can_request_report_revision(uuid) from public;
revoke all on function public.can_approve_report(uuid) from public;
grant execute on function public.can_access_report(uuid) to authenticated;
grant execute on function public.can_edit_report(uuid) to authenticated;
grant execute on function public.can_request_report_revision(uuid) to authenticated;
grant execute on function public.can_approve_report(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Validation and lifecycle triggers.
-- -----------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

create trigger report_attendance_updated_at
before update on public.post_event_report_attendance
for each row execute function public.set_updated_at();
create trigger report_impact_updated_at
before update on public.post_event_report_impact
for each row execute function public.set_updated_at();
create trigger report_finance_updated_at
before update on public.post_event_report_finance
for each row execute function public.set_updated_at();
create trigger report_transactions_updated_at
before update on public.post_event_report_transactions
for each row execute function public.set_updated_at();

create function public.initialize_report_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status <> 'draft' then
    raise exception 'New reports must begin in draft status';
  end if;
  new.finalized := false;
  new.reviewed_by := null;
  new.review_notes := null;
  new.revision_reason := null;
  new.revision_requested_at := null;
  new.submitted_at := null;
  new.approved_at := null;
  new.archived_at := null;
  new.updated_at := now();
  return new;
end;
$function$;

create trigger initialize_report_workflow_trigger
before insert on public.post_event_reports
for each row execute function public.initialize_report_workflow();

create function public.prepare_report_upload_intent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  report_event_id uuid;
begin
  select r.event_id into report_event_id
  from public.post_event_reports r
  where r.id = new.report_id;

  if report_event_id is null or report_event_id <> new.event_id then
    raise exception 'Upload intent event does not match the report event';
  end if;
  if new.created_by <> auth.uid() then
    raise exception 'Upload intent creator must be the authenticated user';
  end if;
  if not public.can_edit_report(new.report_id) then
    raise exception 'Report is not editable';
  end if;

  new.safe_file_name := regexp_replace(
    regexp_replace(new.original_file_name, '[^A-Za-z0-9._-]+', '-', 'g'),
    '^-+|-+$', '', 'g'
  );
  if new.safe_file_name = '' then
    raise exception 'Attachment filename is invalid';
  end if;

  new.storage_bucket := 'event-report-attachments';
  new.storage_path := format(
    'events/%s/reports/%s/%s/%s-%s',
    new.event_id, new.report_id, new.category, new.id, new.safe_file_name
  );
  new.expires_at := least(
    coalesce(new.expires_at, now() + interval '15 minutes'),
    now() + interval '15 minutes'
  );
  new.used_at := null;
  return new;
end;
$function$;

create trigger prepare_report_upload_intent_trigger
before insert on public.post_event_report_upload_intents
for each row execute function public.prepare_report_upload_intent();

create function public.validate_report_attachment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  upload_intent public.post_event_report_upload_intents%rowtype;
begin
  select * into upload_intent
  from public.post_event_report_upload_intents i
  where i.id = new.upload_intent_id
  for update;

  if upload_intent.id is null
     or upload_intent.used_at is not null
     or upload_intent.expires_at <= now() then
    raise exception 'Upload intent is missing, expired, or already used';
  end if;
  if new.id <> upload_intent.id
     or new.report_id <> upload_intent.report_id
     or new.event_id <> upload_intent.event_id
     or new.category <> upload_intent.category
     or new.storage_bucket <> upload_intent.storage_bucket
     or new.storage_path <> upload_intent.storage_path
     or new.file_name <> upload_intent.original_file_name
     or new.file_type <> upload_intent.expected_content_type
     or new.file_size <> upload_intent.expected_size
     or new.uploaded_by <> upload_intent.created_by
     or new.uploaded_by <> auth.uid() then
    raise exception 'Attachment metadata does not match its upload intent';
  end if;
  if not public.can_edit_report(new.report_id) then
    raise exception 'Report is not editable';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = new.storage_bucket and o.name = new.storage_path
  ) then
    raise exception 'Storage upload must complete before attachment metadata is inserted';
  end if;

  return new;
end;
$function$;

create trigger validate_report_attachment_trigger
before insert on public.post_event_report_attachments
for each row execute function public.validate_report_attachment();

create function public.consume_report_upload_intent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.post_event_report_upload_intents
  set used_at = now()
  where id = new.upload_intent_id and used_at is null;
  if not found then
    raise exception 'Upload intent could not be consumed';
  end if;
  return new;
end;
$function$;

create trigger consume_report_upload_intent_trigger
after insert on public.post_event_report_attachments
for each row execute function public.consume_report_upload_intent();

create function public.validate_transaction_attachment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from public.post_event_report_transactions t
    join public.post_event_report_attachments a
      on a.id = new.attachment_id
    where t.id = new.transaction_id
      and t.report_id = a.report_id
      and a.category = 'finance_support'
      and public.can_edit_report(t.report_id)
  ) then
    raise exception 'Finance attachment must belong to the same editable report';
  end if;
  return new;
end;
$function$;

create trigger validate_transaction_attachment_trigger
before insert or update on public.post_event_report_transaction_attachments
for each row execute function public.validate_transaction_attachment();

create function public.protect_report_child_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  parent_report_id uuid;
begin
  parent_report_id := case when tg_op = 'DELETE' then old.report_id else new.report_id end;
  if not public.can_edit_report(parent_report_id) then
    raise exception 'Submitted, approved, and archived report content is immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

create trigger protect_attendance_write
before insert or update or delete on public.post_event_report_attendance
for each row execute function public.protect_report_child_write();
create trigger protect_impact_write
before insert or update or delete on public.post_event_report_impact
for each row execute function public.protect_report_child_write();
create trigger protect_finance_write
before insert or update or delete on public.post_event_report_finance
for each row execute function public.protect_report_child_write();
create trigger protect_transaction_write
before insert or update or delete on public.post_event_report_transactions
for each row execute function public.protect_report_child_write();
create trigger protect_attachment_write
before update or delete on public.post_event_report_attachments
for each row execute function public.protect_report_child_write();

create function public.validate_report_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  transition_note text;
begin
  new.updated_at := now();

  -- Clients cannot independently manipulate the compatibility flag.
  new.finalized := new.status in ('submitted', 'approved', 'archived');

  if new.status = old.status then
    if old.status not in ('draft', 'needs_revision') then
      raise exception 'Submitted, approved, and archived reports are immutable';
    end if;
    if new.reviewed_by is distinct from old.reviewed_by
       or new.review_notes is distinct from old.review_notes
       or new.revision_reason is distinct from old.revision_reason
       or new.revision_requested_at is distinct from old.revision_requested_at
       or new.submitted_at is distinct from old.submitted_at
       or new.approved_at is distinct from old.approved_at
       or new.archived_at is distinct from old.archived_at then
      raise exception 'Workflow fields can change only through a status transition';
    end if;
    return new;
  end if;

  -- Status transitions cannot smuggle content/ownership changes.
  if new.event_id is distinct from old.event_id
     or new.submitted_by is distinct from old.submitted_by
     or new.ocr_data is distinct from old.ocr_data
     or new.venue is distinct from old.venue
     or new.coordinator_name is distinct from old.coordinator_name
     or new.event_summary is distinct from old.event_summary then
    raise exception 'Report content cannot change during a status transition';
  end if;

  if old.status in ('draft', 'needs_revision') and new.status = 'submitted' then
    if not public.can_access_report(old.id) then
      raise exception 'Not authorized to submit this report';
    end if;
    if not exists (select 1 from public.post_event_report_attendance where report_id = old.id)
       or not exists (select 1 from public.post_event_report_impact where report_id = old.id)
       or not exists (select 1 from public.post_event_report_finance where report_id = old.id) then
      raise exception 'Attendance, impact, and finance summaries are required before submission';
    end if;
    new.submitted_at := now();
    new.reviewed_by := null;
    new.review_notes := null;
    new.revision_reason := null;
    new.revision_requested_at := null;

  elsif old.status = 'submitted' and new.status = 'needs_revision' then
    if not public.can_request_report_revision(old.id) then
      raise exception 'Not authorized to request revision or reviewer is the submitter';
    end if;
    if nullif(btrim(new.revision_reason), '') is null then
      raise exception 'Revision reason is required';
    end if;
    new.reviewed_by := auth.uid();
    new.revision_requested_at := now();
    transition_note := new.revision_reason;

  elsif old.status = 'submitted' and new.status = 'approved' then
    if not public.can_approve_report(old.id) then
      raise exception 'Only a non-submitting Admin or Super Admin may approve';
    end if;
    new.reviewed_by := auth.uid();
    new.approved_at := now();
    transition_note := new.review_notes;

  elsif old.status = 'approved' and new.status = 'archived' then
    if not public.has_role(array['super_admin', 'admin']) then
      raise exception 'Only Admin or Super Admin may archive';
    end if;
    new.archived_at := now();
    transition_note := new.review_notes;

  else
    raise exception 'Invalid report transition from % to %', old.status, new.status;
  end if;

  insert into public.post_event_report_reviews (
    report_id, reviewer_id, from_status, to_status, notes
  ) values (
    old.id, auth.uid(), old.status, new.status, transition_note
  );
  return new;
end;
$function$;

create trigger validate_report_transition_trigger
before update on public.post_event_reports
for each row execute function public.validate_report_transition();

-- -----------------------------------------------------------------------------
-- 6. RLS. No anon policy is created. Every policy explicitly targets
--    authenticated and every update policy includes USING and WITH CHECK.
-- -----------------------------------------------------------------------------

alter table public.event_assignments enable row level security;
alter table public.post_event_report_attendance enable row level security;
alter table public.post_event_report_impact enable row level security;
alter table public.post_event_report_finance enable row level security;
alter table public.post_event_report_transactions enable row level security;
alter table public.post_event_report_upload_intents enable row level security;
alter table public.post_event_report_attachments enable row level security;
alter table public.post_event_report_transaction_attachments enable row level security;
alter table public.post_event_report_reviews enable row level security;

create policy event_assignments_select_mvp on public.event_assignments
for select to authenticated
using (
  user_id = auth.uid()
  or public.has_role(array['super_admin', 'admin'])
  or exists (
    select 1 from public.events e
    where e.id = event_assignments.event_id
      and public.is_chapter_member(e.chapter_id, array['chapter_coordinator'])
  )
);
create policy event_assignments_insert_mvp on public.event_assignments
for insert to authenticated
with check (
  public.has_role(array['super_admin', 'admin'])
  and assigned_by = auth.uid() and user_id <> auth.uid()
);
create policy event_assignments_update_mvp on public.event_assignments
for update to authenticated
using (public.has_role(array['super_admin', 'admin']))
with check (
  public.has_role(array['super_admin', 'admin'])
  and assigned_by = auth.uid() and user_id <> auth.uid()
);
create policy event_assignments_delete_mvp on public.event_assignments
for delete to authenticated
using (public.has_role(array['super_admin', 'admin']));

-- Replace only the three policies verified in preflight. No report DELETE policy
-- is introduced.
drop policy reports_select on public.post_event_reports;
drop policy reports_insert on public.post_event_reports;
drop policy reports_update on public.post_event_reports;

create policy reports_select_mvp on public.post_event_reports
for select to authenticated using (public.can_access_report(id));
create policy reports_insert_mvp on public.post_event_reports
for insert to authenticated
with check (
  submitted_by = auth.uid() and status = 'draft'
  and (
    public.has_role(array['super_admin', 'admin'])
    or exists (
      select 1 from public.events e
      where e.id = post_event_reports.event_id
        and public.is_chapter_member(e.chapter_id, array['chapter_coordinator'])
    )
    or exists (
      select 1 from public.event_assignments ea
      where ea.event_id = post_event_reports.event_id
        and ea.user_id = auth.uid()
        and ea.assignment_role = 'event_coordinator'
    )
  )
);
create policy reports_update_mvp on public.post_event_reports
for update to authenticated
using (
  public.can_edit_report(id)
  or public.can_request_report_revision(id)
  or public.can_approve_report(id)
  or (status = 'approved' and public.has_role(array['super_admin', 'admin']))
)
with check (public.can_access_report(id));

create policy attendance_select_mvp on public.post_event_report_attendance
for select to authenticated using (public.can_access_report(report_id));
create policy attendance_insert_mvp on public.post_event_report_attendance
for insert to authenticated with check (public.can_edit_report(report_id));
create policy attendance_update_mvp on public.post_event_report_attendance
for update to authenticated using (public.can_edit_report(report_id))
with check (public.can_edit_report(report_id));
create policy attendance_delete_mvp on public.post_event_report_attendance
for delete to authenticated using (public.can_edit_report(report_id));

create policy impact_select_mvp on public.post_event_report_impact
for select to authenticated using (public.can_access_report(report_id));
create policy impact_insert_mvp on public.post_event_report_impact
for insert to authenticated with check (public.can_edit_report(report_id));
create policy impact_update_mvp on public.post_event_report_impact
for update to authenticated using (public.can_edit_report(report_id))
with check (public.can_edit_report(report_id));
create policy impact_delete_mvp on public.post_event_report_impact
for delete to authenticated using (public.can_edit_report(report_id));

create policy finance_select_mvp on public.post_event_report_finance
for select to authenticated using (public.can_access_report(report_id));
create policy finance_insert_mvp on public.post_event_report_finance
for insert to authenticated with check (public.can_edit_report(report_id));
create policy finance_update_mvp on public.post_event_report_finance
for update to authenticated using (public.can_edit_report(report_id))
with check (public.can_edit_report(report_id));
create policy finance_delete_mvp on public.post_event_report_finance
for delete to authenticated using (public.can_edit_report(report_id));

create policy transactions_select_mvp on public.post_event_report_transactions
for select to authenticated using (public.can_access_report(report_id));
create policy transactions_insert_mvp on public.post_event_report_transactions
for insert to authenticated
with check (created_by = auth.uid() and public.can_edit_report(report_id));
create policy transactions_update_mvp on public.post_event_report_transactions
for update to authenticated using (public.can_edit_report(report_id))
with check (created_by = auth.uid() and public.can_edit_report(report_id));
create policy transactions_delete_mvp on public.post_event_report_transactions
for delete to authenticated using (public.can_edit_report(report_id));

create policy upload_intents_select_mvp on public.post_event_report_upload_intents
for select to authenticated
using (created_by = auth.uid() and public.can_access_report(report_id));
create policy upload_intents_insert_mvp on public.post_event_report_upload_intents
for insert to authenticated
with check (created_by = auth.uid() and public.can_edit_report(report_id));
create policy upload_intents_cleanup_delete_mvp
on public.post_event_report_upload_intents
for delete to authenticated
using (
  public.has_role(array['super_admin', 'admin'])
  and used_at is null
  and expires_at <= now()
  and not exists (
    select 1 from storage.objects o
    where o.bucket_id = storage_bucket and o.name = storage_path
  )
);
-- Intents cannot be updated by clients. An expired intent can be deleted by an
-- Admin only after the associated orphan object has been removed via Storage API.

create policy attachments_select_mvp on public.post_event_report_attachments
for select to authenticated using (public.can_access_report(report_id));
create policy attachments_insert_mvp on public.post_event_report_attachments
for insert to authenticated
with check (uploaded_by = auth.uid() and public.can_edit_report(report_id));
create policy attachments_update_mvp on public.post_event_report_attachments
for update to authenticated
using (
  public.can_edit_report(report_id)
  and (
    uploaded_by = auth.uid()
    or (
      public.has_role(array['super_admin', 'admin'])
      and exists (
        select 1 from public.post_event_reports r
        where r.id = report_id and r.status = 'needs_revision'
      )
    )
  )
)
with check (
  public.can_edit_report(report_id)
  and (
    uploaded_by = auth.uid()
    or (
      public.has_role(array['super_admin', 'admin'])
      and exists (
        select 1 from public.post_event_reports r
        where r.id = report_id and r.status = 'needs_revision'
      )
    )
  )
);
create policy attachments_delete_mvp on public.post_event_report_attachments
for delete to authenticated
using (
  public.can_edit_report(report_id)
  and (
    uploaded_by = auth.uid()
    or (
      public.has_role(array['super_admin', 'admin'])
      and exists (
        select 1 from public.post_event_reports r
        where r.id = report_id and r.status = 'needs_revision'
      )
    )
  )
);

create policy transaction_attachments_select_mvp
on public.post_event_report_transaction_attachments
for select to authenticated
using (
  exists (
    select 1 from public.post_event_report_transactions t
    where t.id = transaction_id and public.can_access_report(t.report_id)
  )
);
create policy transaction_attachments_insert_mvp
on public.post_event_report_transaction_attachments
for insert to authenticated
with check (
  exists (
    select 1 from public.post_event_report_transactions t
    where t.id = transaction_id and public.can_edit_report(t.report_id)
  )
);
create policy transaction_attachments_update_mvp
on public.post_event_report_transaction_attachments
for update to authenticated
using (
  exists (
    select 1 from public.post_event_report_transactions t
    where t.id = transaction_id and public.can_edit_report(t.report_id)
  )
)
with check (
  exists (
    select 1 from public.post_event_report_transactions t
    where t.id = transaction_id and public.can_edit_report(t.report_id)
  )
);
create policy transaction_attachments_delete_mvp
on public.post_event_report_transaction_attachments
for delete to authenticated
using (
  exists (
    select 1 from public.post_event_report_transactions t
    where t.id = transaction_id and public.can_edit_report(t.report_id)
  )
);

create policy reviews_select_mvp on public.post_event_report_reviews
for select to authenticated using (public.can_access_report(report_id));
-- Review rows are trigger-created and immutable. No client INSERT, UPDATE, or
-- DELETE policy is intentionally provided.

-- -----------------------------------------------------------------------------
-- 7. Private Storage bucket and policies.
--    These statements are review-only and are NOT being executed now.
-- -----------------------------------------------------------------------------

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'event-report-attachments',
  'event-report-attachments',
  false,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]
);

create policy report_objects_select_mvp on storage.objects
for select to authenticated
using (
  bucket_id = 'event-report-attachments'
  and exists (
    select 1 from public.post_event_report_attachments a
    where a.storage_bucket = storage.objects.bucket_id
      and a.storage_path = storage.objects.name
      and public.can_access_report(a.report_id)
  )
);

create policy report_objects_insert_mvp on storage.objects
for insert to authenticated
with check (
  bucket_id = 'event-report-attachments'
  and exists (
    select 1 from public.post_event_report_upload_intents i
    where i.storage_bucket = storage.objects.bucket_id
      and i.storage_path = storage.objects.name
      and i.created_by = auth.uid()
      and i.used_at is null
      and i.expires_at > now()
      and public.can_edit_report(i.report_id)
  )
);

create policy report_objects_delete_mvp on storage.objects
for delete to authenticated
using (
  bucket_id = 'event-report-attachments'
  and (
    exists (
      select 1 from public.post_event_report_attachments a
      where a.storage_bucket = storage.objects.bucket_id
        and a.storage_path = storage.objects.name
        and public.can_edit_report(a.report_id)
        and (
          a.uploaded_by = auth.uid()
          or (
            public.has_role(array['super_admin', 'admin'])
            and exists (
              select 1 from public.post_event_reports r
              where r.id = a.report_id and r.status = 'needs_revision'
            )
          )
        )
    )
    or exists (
      select 1 from public.post_event_report_upload_intents i
      where i.storage_bucket = storage.objects.bucket_id
        and i.storage_path = storage.objects.name
        and i.created_by = auth.uid()
        and i.used_at is null
        and i.expires_at > now()
        and public.can_edit_report(i.report_id)
    )
    or exists (
      select 1 from public.post_event_report_upload_intents i
      where i.storage_bucket = storage.objects.bucket_id
        and i.storage_path = storage.objects.name
        and i.used_at is null
        and i.expires_at <= now()
        and public.has_role(array['super_admin', 'admin'])
    )
  )
);

-- No storage.objects UPDATE policy: objects cannot be overwritten in place.

-- -----------------------------------------------------------------------------
-- 8. Post-migration verification. These blocks abort and roll back this entire
--    transaction when an invariant is violated.
-- -----------------------------------------------------------------------------

do $verify$
begin
  if exists (
    select event_id from public.post_event_reports
    group by event_id having count(*) > 1
  ) then
    raise exception 'Verification failed: duplicate event reports exist';
  end if;

  if exists (
    select 1 from public.post_event_reports
    where finalized and status not in ('submitted', 'approved', 'archived')
  ) or exists (
    select 1 from public.post_event_reports
    where not finalized and status in ('submitted', 'approved', 'archived')
  ) then
    raise exception 'Verification failed: finalized compatibility mapping is inconsistent';
  end if;

  if exists (
    select 1
    from public.post_event_report_attachments a
    join public.post_event_reports r on r.id = a.report_id
    where a.event_id <> r.event_id
  ) then
    raise exception 'Verification failed: attachment/report event mismatch';
  end if;

  if exists (
    select 1
    from public.post_event_report_transaction_attachments j
    join public.post_event_report_transactions t on t.id = j.transaction_id
    join public.post_event_report_attachments a on a.id = j.attachment_id
    where t.report_id <> a.report_id or a.category <> 'finance_support'
  ) then
    raise exception 'Verification failed: cross-report finance attachment';
  end if;

  if exists (
    select 1
    from public.post_event_report_reviews rv
    join public.post_event_reports r on r.id = rv.report_id
    where rv.reviewer_id = r.submitted_by
      and rv.to_status in ('needs_revision', 'approved')
  ) then
    raise exception 'Verification failed: self-review exists';
  end if;
end
$verify$;

-- Additional operator verification queries to run manually after a future test
-- deployment (kept commented so their result sets are not migration output):
--
-- select status, finalized, count(*)
-- from public.post_event_reports group by status, finalized order by status;
--
-- select schemaname, tablename, policyname, roles, cmd, qual, with_check
-- from pg_policies
-- where schemaname in ('public', 'storage')
--   and (tablename like 'post_event_report%' or tablename = 'event_assignments'
--        or (schemaname = 'storage' and tablename = 'objects'))
-- order by schemaname, tablename, policyname;
--
-- select id, public, file_size_limit, allowed_mime_types
-- from storage.buckets where id = 'event-report-attachments';
--
-- select i.id, i.storage_path
-- from public.post_event_report_upload_intents i
-- left join public.post_event_report_attachments a on a.upload_intent_id = i.id
-- where i.used_at is null and i.expires_at <= now() and a.id is null;

commit;

-- -----------------------------------------------------------------------------
-- ROLLBACK CONSIDERATIONS (documentation only; intentionally not executable):
--
-- 1. Disable frontend report persistence/upload before rollback.
-- 2. Export all new table rows and a Storage object manifest.
-- 3. Remove the three report Storage policies; never delete objects via SQL.
-- 4. Restore the exact legacy reports_select/reports_insert/reports_update
--    policies captured in the authoritative schema dump.
-- 5. Drop new triggers/functions, junction tables, child tables, assignments,
--    unique event constraint, additive columns, then the status enum.
-- 6. Preserve ocr_data and finalized throughout rollback.
-- 7. Once real MVP data exists, prefer a forward corrective migration because
--    dropping these structures would be destructive.
-- -----------------------------------------------------------------------------
