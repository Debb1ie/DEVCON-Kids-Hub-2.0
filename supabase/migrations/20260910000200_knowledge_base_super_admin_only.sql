-- REVIEW ONLY: make Knowledge Base management Super Admin-only while
-- preserving chatbot retrieval for authenticated, approved roles.
-- This file must be tested locally and deployed separately under explicit approval.

begin;

do $$
declare
  collision text;
begin
  if to_regclass('public.documents') is null
     or to_regclass('public.knowledge_base') is null then
    raise exception 'Preflight failed: Knowledge Base tables are missing';
  end if;

  if to_regprocedure('public.has_role(text[])') is null then
    raise exception 'Preflight failed: hardened role helper is missing';
  end if;

  if to_regprocedure('public.search_knowledge_base(vector,double precision,integer)') is null then
    raise exception 'Preflight failed: Knowledge Base search RPC is missing';
  end if;

  select p.policyname into collision
  from pg_policies p
  where (p.schemaname, p.tablename, p.policyname) in (
    ('public', 'documents', 'documents_superadmin_rbac'),
    ('public', 'knowledge_base', 'knowledge_base_superadmin_rbac'),
    ('storage', 'objects', 'knowledge_source_objects_select_superadmin'),
    ('storage', 'objects', 'knowledge_source_objects_insert_superadmin'),
    ('storage', 'objects', 'knowledge_source_objects_update_superadmin'),
    ('storage', 'objects', 'knowledge_source_objects_delete_superadmin')
  )
  limit 1;

  if collision is not null then
    raise exception 'Preflight failed: target policy already exists: %', collision;
  end if;
end
$$;

drop policy documents_modify_admin_rbac on public.documents;
drop policy documents_select_approved_rbac on public.documents;
create policy documents_superadmin_rbac
on public.documents for all to authenticated
using (public.has_role(array['super_admin']))
with check (public.has_role(array['super_admin']));

drop policy knowledge_base_select_approved_rbac on public.knowledge_base;
drop policy knowledge_base_modify_admin_rbac on public.knowledge_base;
create policy knowledge_base_superadmin_rbac
on public.knowledge_base for all to authenticated
using (public.has_role(array['super_admin']))
with check (public.has_role(array['super_admin']));

-- Approved users retrieve bounded chunks through this guarded RPC. Direct table
-- access remains Super Admin-only, preventing management/source browsing by other roles.
create or replace function public.search_knowledge_base(
  query_embedding vector(1024),
  similarity_threshold double precision default 0.7,
  match_count integer default 5
)
returns table(
  id bigint,
  document_id text,
  document_title text,
  content text,
  page_number integer,
  similarity double precision
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  if not public.has_role(array[
    'super_admin',
    'admin',
    'chapter_coordinator',
    'event_coordinator',
    'volunteer'
  ]) then
    raise exception using
      errcode = '42501',
      message = 'Knowledge search is unavailable for this account.';
  end if;

  if match_count < 1 or match_count > 20 then
    raise exception using errcode = '22023', message = 'Invalid search limit.';
  end if;

  return query
  select
    kb.id,
    kb.document_id,
    kb.document_title,
    kb.content,
    kb.page_number,
    (1 - (kb.embedding <=> query_embedding))::double precision
  from public.knowledge_base kb
  where kb.embedding is not null
    and (1 - (kb.embedding <=> query_embedding)) > similarity_threshold
  order by kb.embedding <=> query_embedding
  limit match_count;
end
$$;

revoke all on function public.search_knowledge_base(vector,double precision,integer) from public, anon;
grant execute on function public.search_knowledge_base(vector,double precision,integer) to authenticated;

-- Reserved private source-file path. This does not create a bucket. If the
-- knowledge-base-documents bucket is introduced later, only Super Admins can access it.
create policy knowledge_source_objects_select_superadmin
on storage.objects for select to authenticated
using (bucket_id = 'knowledge-base-documents' and public.has_role(array['super_admin']));

create policy knowledge_source_objects_insert_superadmin
on storage.objects for insert to authenticated
with check (bucket_id = 'knowledge-base-documents' and public.has_role(array['super_admin']));

create policy knowledge_source_objects_update_superadmin
on storage.objects for update to authenticated
using (bucket_id = 'knowledge-base-documents' and public.has_role(array['super_admin']))
with check (bucket_id = 'knowledge-base-documents' and public.has_role(array['super_admin']));

create policy knowledge_source_objects_delete_superadmin
on storage.objects for delete to authenticated
using (bucket_id = 'knowledge-base-documents' and public.has_role(array['super_admin']));

-- Verification queries (run read-only after application):
-- select policyname, cmd, roles, qual, with_check from pg_policies
-- where (schemaname = 'public' and tablename in ('documents','knowledge_base'))
--    or (schemaname = 'storage' and tablename = 'objects' and policyname like 'knowledge_source_%');
-- select has_function_privilege('anon', 'public.search_knowledge_base(vector,double precision,integer)', 'execute');
-- select has_function_privilege('authenticated', 'public.search_knowledge_base(vector,double precision,integer)', 'execute');

-- Rollback requires a separately reviewed migration restoring the previous
-- approved-role SELECT policies, Admin mutation policies, RPC security mode,
-- grants, and removal of the four reserved Storage policies.

commit;
