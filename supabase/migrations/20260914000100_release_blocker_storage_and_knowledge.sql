-- REVIEW ONLY: release-blocker storage and Knowledge Base schema reconciliation.
-- This migration is additive and must be validated locally before controlled deployment.
begin;

do $preflight$
begin
  if to_regclass('public.documents') is null
     or to_regclass('public.knowledge_base') is null
     or to_regclass('public.events') is null
     or to_regclass('storage.buckets') is null
     or to_regclass('storage.objects') is null
     or to_regprocedure('public.has_role(text[])') is null
     or to_regprocedure('public.can_manage_event(uuid)') is null then
    raise exception 'Release-blocker migration prerequisites are missing';
  end if;
  if to_regprocedure('public.finalize_knowledge_document(text,text,text,integer,integer,bigint,text,jsonb)') is not null
     or to_regprocedure('public.prepare_event_image_upload(uuid,text,text,bigint)') is not null
     or to_regprocedure('public.finalize_event_image_upload(uuid)') is not null
     or to_regprocedure('public.can_view_event_image(text)') is not null
     or to_regclass('public.event_image_upload_intents') is not null then
    raise exception 'Release-blocker object collision detected';
  end if;
end
$preflight$;

-- The authoritative documents table predates uploaded_by even though the browser
-- repository already sends it. Keep legacy rows nullable; all new writes use the RPC.
do $documents_uploaded_by$
declare column_type text;
begin
  select c.udt_name into column_type
  from information_schema.columns c
  where c.table_schema='public' and c.table_name='documents' and c.column_name='uploaded_by';
  if column_type is null then
    alter table public.documents add column uploaded_by uuid references auth.users(id) on delete set null;
  elsif column_type <> 'uuid' then
    raise exception 'documents.uploaded_by exists with incompatible type: %', column_type;
  end if;
end
$documents_uploaded_by$;
alter table public.documents add column storage_bucket text;
alter table public.documents add column storage_path text;
create unique index documents_storage_object_uidx
  on public.documents(storage_bucket, storage_path)
  where storage_bucket is not null and storage_path is not null;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'knowledge-base-documents', 'knowledge-base-documents', false, 52428800,
  array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain']
);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-images', 'event-images', false, 10485760,
  array['image/jpeg','image/png','image/webp']
);

create function public.finalize_knowledge_document(
  document_id text,
  document_title text,
  document_file_type text,
  document_total_chunks integer,
  document_total_pages integer,
  document_file_size bigint,
  source_storage_path text,
  chunks jsonb
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, storage, extensions
as $$
declare
  chunk jsonb;
  inserted_count integer := 0;
begin
  if not public.has_role(array['super_admin']) then
    raise exception using errcode='42501', message='Knowledge Base management is unavailable for this account.';
  end if;
  if document_id !~ '^doc_[0-9a-f-]{36}$'
     or document_title is null or btrim(document_title) = ''
     or document_file_type not in ('pdf','docx','txt')
     or document_total_chunks < 1 or document_total_chunks > 5000
     or document_total_pages < 1
     or document_file_size < 1 or document_file_size > 52428800
     or jsonb_typeof(chunks) <> 'array'
     or jsonb_array_length(chunks) <> document_total_chunks
     or source_storage_path !~ ('^sources/' || auth.uid()::text || '/' || document_id || '/[A-Za-z0-9._-]+$') then
    raise exception using errcode='22023', message='Invalid Knowledge Base document metadata.';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id='knowledge-base-documents' and o.name=source_storage_path
      and coalesce((o.metadata->>'size')::bigint,0)=document_file_size
  ) then
    raise exception 'Knowledge Base source upload must complete before metadata is saved';
  end if;

  insert into public.documents(
    id,title,file_type,total_chunks,total_pages,file_size_bytes,created_at,
    uploaded_by,storage_bucket,storage_path
  ) values (
    document_id,btrim(document_title),document_file_type,document_total_chunks,
    document_total_pages,document_file_size,now(),auth.uid(),
    'knowledge-base-documents',source_storage_path
  );

  for chunk in select value from jsonb_array_elements(chunks)
  loop
    if nullif(btrim(chunk->>'content'),'') is null then
      raise exception 'Knowledge Base chunk content is required';
    end if;
    insert into public.knowledge_base(document_id,document_title,content,embedding,page_number,created_at)
    values (
      document_id,btrim(document_title),chunk->>'content',
      case when chunk->'embedding' is null or chunk->'embedding'='null'::jsonb
        then null else (chunk->'embedding')::text::vector(1024) end,
      greatest(coalesce((chunk->>'page_number')::integer,1),1),now()
    );
    inserted_count := inserted_count + 1;
  end loop;
  return inserted_count;
end
$$;

revoke all on function public.finalize_knowledge_document(text,text,text,integer,integer,bigint,text,jsonb) from public, anon;
grant execute on function public.finalize_knowledge_document(text,text,text,integer,integer,bigint,text,jsonb) to authenticated;

create table public.event_image_upload_intents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  storage_path text not null unique,
  original_file_name text not null,
  expected_content_type text not null,
  expected_size bigint not null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used_at timestamptz,
  check (expected_content_type in ('image/jpeg','image/png','image/webp')),
  check (expected_size between 1 and 10485760),
  check (expires_at > created_at)
);
alter table public.event_image_upload_intents enable row level security;
alter table public.events add column image_storage_path text;

create function public.prepare_event_image_upload(
  target_event_id uuid,
  original_file_name text,
  expected_content_type text,
  expected_size bigint
)
returns table(upload_intent_id uuid, storage_bucket text, storage_path text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  intent_id uuid := gen_random_uuid();
  safe_name text;
  target_path text;
begin
  if not public.can_manage_event(target_event_id) then
    raise exception using errcode='42501', message='Not authorized to upload an image for this event.';
  end if;
  if expected_content_type not in ('image/jpeg','image/png','image/webp')
     or expected_size < 1 or expected_size > 10485760 then
    raise exception using errcode='22023', message='Invalid event image.';
  end if;
  safe_name := regexp_replace(coalesce(original_file_name,'image'), '[^A-Za-z0-9._-]+', '_', 'g');
  safe_name := left(coalesce(nullif(safe_name,''),'image'), 120);
  target_path := 'events/' || target_event_id::text || '/' || intent_id::text || '-' || safe_name;
  insert into public.event_image_upload_intents(
    id,event_id,storage_path,original_file_name,expected_content_type,expected_size
  ) values (intent_id,target_event_id,target_path,safe_name,expected_content_type,expected_size);
  return query select intent_id, 'event-images'::text, target_path;
end
$$;

create function public.finalize_event_image_upload(target_upload_intent_id uuid)
returns table(event_id uuid, image_storage_path text, previous_storage_path text)
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $$
declare
  intent public.event_image_upload_intents%rowtype;
  old_path text;
begin
  select * into intent from public.event_image_upload_intents
  where id=target_upload_intent_id for update;
  if intent.id is null or intent.created_by<>auth.uid() or intent.used_at is not null or intent.expires_at<=now()
     or not public.can_manage_event(intent.event_id) then
    raise exception using errcode='42501', message='Invalid or expired event image upload.';
  end if;
  if not exists (
    select 1 from storage.objects o where o.bucket_id='event-images' and o.name=intent.storage_path
      and coalesce(o.metadata->>'mimetype','')=intent.expected_content_type
      and coalesce((o.metadata->>'size')::bigint,0)=intent.expected_size
  ) then
    raise exception 'Event image upload must complete before it is attached';
  end if;
  select e.image_storage_path into old_path from public.events e where e.id=intent.event_id for update;
  update public.events set image_storage_path=intent.storage_path where id=intent.event_id;
  update public.event_image_upload_intents set used_at=now() where id=intent.id;
  return query select intent.event_id,intent.storage_path,old_path;
end
$$;

revoke all on function public.prepare_event_image_upload(uuid,text,text,bigint) from public, anon;
revoke all on function public.finalize_event_image_upload(uuid) from public, anon;
grant execute on function public.prepare_event_image_upload(uuid,text,text,bigint) to authenticated;
grant execute on function public.finalize_event_image_upload(uuid) to authenticated;

create function public.can_view_event_image(target_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.has_role(array['super_admin','admin','chapter_coordinator','event_coordinator','volunteer'])
    and exists (select 1 from public.events e where e.image_storage_path=target_storage_path)
$$;
revoke all on function public.can_view_event_image(text) from public, anon;
grant execute on function public.can_view_event_image(text) to authenticated;

revoke all on public.event_image_upload_intents from public, anon, authenticated;
grant select on public.event_image_upload_intents to authenticated;
create policy event_image_intents_select_own on public.event_image_upload_intents
for select to authenticated
using (created_by=auth.uid() and public.can_manage_event(event_id));

create policy event_images_insert_authorized on storage.objects for insert to authenticated
with check (
  bucket_id='event-images' and exists (
    select 1 from public.event_image_upload_intents i
    where i.storage_path=storage.objects.name and i.created_by=auth.uid()
      and i.used_at is null and i.expires_at>now() and public.can_manage_event(i.event_id)
  )
);
create policy event_images_select_approved on storage.objects for select to authenticated
using (
  bucket_id='event-images'
  and public.can_view_event_image(storage.objects.name)
);
create policy event_images_delete_authorized on storage.objects for delete to authenticated
using (
  bucket_id='event-images' and (
    (
      storage.objects.name ~ '^events/[0-9a-f-]{36}/[A-Za-z0-9._-]+$'
      and public.can_manage_event(split_part(storage.objects.name,'/',2)::uuid)
    )
    or exists (
      select 1 from public.event_image_upload_intents i
      where i.storage_path=storage.objects.name and i.created_by=auth.uid()
        and i.used_at is null and public.can_manage_event(i.event_id)
    )
  )
);

-- Existing policies from 20260910000200 reserve this bucket for Super Admin only.
-- No public bucket or anonymous write policy is introduced.

comment on function public.finalize_knowledge_document(text,text,text,integer,integer,bigint,text,jsonb)
  is 'Atomically saves Super-Admin-uploaded document metadata and shared retrieval chunks after private source upload.';
comment on function public.prepare_event_image_upload(uuid,text,text,bigint)
  is 'Creates a short-lived, actor-bound private event image upload intent.';
comment on function public.finalize_event_image_upload(uuid)
  is 'Atomically attaches a completed private image upload to its event without queuing Google automation.';

commit;

-- Verification (read-only): inspect columns, functions, grants, buckets and policies;
-- run role/RLS HTTP tests; confirm event creation queues zero Google jobs.
-- Rollback requires separate approval: drop the new policies/functions/intent table,
-- remove new columns only after proving they contain no required data, and remove buckets
-- only after separately backing up and safely handling their objects.
