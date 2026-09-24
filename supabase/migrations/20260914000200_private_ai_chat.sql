-- REVIEW ONLY: harden existing chat history for private per-user persistence and
-- move raw Knowledge Base retrieval behind the server-side ai-chat function.
begin;

do $$
begin
  if to_regclass('public.ai_chat_sessions') is null
     or to_regclass('public.ai_chat_messages') is null
     or to_regclass('public.knowledge_base') is null
     or to_regprocedure('public.has_role(text[])') is null
     or to_regprocedure('public.search_knowledge_base(vector,double precision,integer)') is null then
    raise exception 'Preflight failed: authoritative AI dependencies are missing';
  end if;
  if to_regprocedure('public.search_knowledge_base_server(vector,double precision,integer)') is not null
     or to_regprocedure('public.validate_ai_chat_message_owner()') is not null then
    raise exception 'Preflight failed: private-chat target functions already exist';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='ai_chat_messages' and column_name='user_id')
     or exists (select 1 from information_schema.columns where table_schema='public' and table_name='ai_chat_sessions' and column_name='updated_at') then
    raise exception 'Preflight failed: private-chat target columns already exist';
  end if;
end
$$;

alter table public.ai_chat_sessions add column updated_at timestamptz not null default now();
alter table public.ai_chat_messages add column user_id uuid references auth.users(id) on delete cascade;

-- Preserve legacy rows by deriving message ownership from their parent session.
update public.ai_chat_messages m set user_id=s.user_id
from public.ai_chat_sessions s where s.id=m.session_id and m.user_id is null;

do $$
begin
  if exists (select 1 from public.ai_chat_sessions where user_id is null)
     or exists (select 1 from public.ai_chat_messages where session_id is null or user_id is null)
     or exists (select 1 from public.ai_chat_messages m join public.ai_chat_sessions s on s.id=m.session_id where m.user_id<>s.user_id) then
    raise exception 'Preflight failed: legacy chat rows have missing or inconsistent ownership';
  end if;
end
$$;

alter table public.ai_chat_sessions alter column user_id set not null;
alter table public.ai_chat_sessions alter column title set default 'New conversation';
update public.ai_chat_sessions set title='New conversation' where title is null or btrim(title)='';
alter table public.ai_chat_sessions alter column title set not null;
alter table public.ai_chat_messages alter column session_id set not null;
alter table public.ai_chat_messages alter column user_id set not null;
alter table public.ai_chat_messages alter column citations set default '[]'::jsonb;
update public.ai_chat_messages set citations='[]'::jsonb where citations is null;
alter table public.ai_chat_messages alter column citations set not null;
alter table public.ai_chat_messages add constraint ai_chat_messages_role_check check (role in ('user','assistant'));
alter table public.ai_chat_messages add constraint ai_chat_messages_citations_array_check check (jsonb_typeof(citations)='array');

create index ai_chat_sessions_user_updated_idx on public.ai_chat_sessions(user_id,updated_at desc);
create index ai_chat_messages_session_created_idx on public.ai_chat_messages(session_id,created_at,id);
create index ai_chat_messages_user_created_idx on public.ai_chat_messages(user_id,created_at desc);

create function public.validate_ai_chat_message_owner()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not exists (select 1 from public.ai_chat_sessions s where s.id=new.session_id and s.user_id=new.user_id) then
    raise exception using errcode='42501', message='Conversation ownership is invalid.';
  end if;
  return new;
end
$$;
create trigger validate_ai_chat_message_owner_trigger before insert or update on public.ai_chat_messages
for each row execute function public.validate_ai_chat_message_owner();

alter table public.ai_chat_sessions enable row level security;
alter table public.ai_chat_messages enable row level security;
do $$
declare policy_row record;
begin
  if exists (
    select 1 from pg_policies where schemaname='public'
    and tablename in ('ai_chat_sessions','ai_chat_messages')
    and policyname not in (
      'Users can view their own chat sessions','Users can view chat sessions',
      'Users can insert chat sessions','Users can view chat messages','Users can insert chat messages'
    )
  ) then
    raise exception 'Preflight failed: unexpected legacy chat policy exists';
  end if;
  for policy_row in select tablename,policyname from pg_policies
    where schemaname='public' and tablename in ('ai_chat_sessions','ai_chat_messages')
  loop
    execute format('drop policy %I on public.%I',policy_row.policyname,policy_row.tablename);
  end loop;
end
$$;

create policy ai_chat_sessions_owner_select on public.ai_chat_sessions for select to authenticated
using (user_id=auth.uid() and public.has_role(array['super_admin','admin','chapter_coordinator','event_coordinator','volunteer']));
create policy ai_chat_sessions_owner_delete on public.ai_chat_sessions for delete to authenticated
using (user_id=auth.uid() and public.has_role(array['super_admin','admin','chapter_coordinator','event_coordinator','volunteer']));
create policy ai_chat_messages_owner_select on public.ai_chat_messages for select to authenticated
using (user_id=auth.uid() and public.has_role(array['super_admin','admin','chapter_coordinator','event_coordinator','volunteer']));
create policy ai_chat_messages_owner_delete on public.ai_chat_messages for delete to authenticated
using (user_id=auth.uid() and public.has_role(array['super_admin','admin','chapter_coordinator','event_coordinator','volunteer']));

revoke all on table public.ai_chat_sessions,public.ai_chat_messages from public,anon,authenticated;
grant select,delete on table public.ai_chat_sessions,public.ai_chat_messages to authenticated;
revoke all on function public.validate_ai_chat_message_owner() from public,anon,authenticated;

-- Browser roles receive answers and citation labels from ai-chat, never raw chunks.
revoke all on function public.search_knowledge_base(vector,double precision,integer) from public,anon,authenticated;
create function public.search_knowledge_base_server(query_embedding vector(1024),similarity_threshold double precision default 0.3,match_count integer default 5)
returns table(document_id text,document_title text,content text,page_number integer,similarity double precision)
language sql stable security definer set search_path=pg_catalog,public,extensions as $$
  select kb.document_id,kb.document_title,kb.content,kb.page_number,(1-(kb.embedding<=>query_embedding))::double precision
  from public.knowledge_base kb where kb.embedding is not null
  and (1-(kb.embedding<=>query_embedding))>similarity_threshold
  order by kb.embedding<=>query_embedding limit greatest(1,least(match_count,8));
$$;
revoke all on function public.search_knowledge_base_server(vector,double precision,integer) from public,anon,authenticated;
grant execute on function public.search_knowledge_base_server(vector,double precision,integer) to service_role;

-- Verification: inspect pg_policies and has_function_privilege for authenticated/service_role.
-- Rollback requires a separately reviewed migration restoring legacy policies and grants.
commit;
