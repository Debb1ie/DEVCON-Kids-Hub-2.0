-- REVIEW ONLY. Apply after 20260909000100_post_event_report_mvp.sql.
begin;

do $$
declare required_table text;
begin
  foreach required_table in array array['chapters','profiles','user_roles','events','volunteers','inventory','inventory_requests','audit_logs','event_assignments','ai_settings','ai_faq_suggestions','documents','knowledge_base','event_tasks','social_media_posts'] loop
    if to_regclass('public.' || required_table) is null then raise exception 'RBAC preflight: missing public.%', required_table; end if;
  end loop;
  if to_regprocedure('public.has_role(text[])') is null or to_regprocedure('public.is_chapter_member(uuid,text[])') is null then
    raise exception 'RBAC preflight: expected role helpers are missing';
  end if;
end $$;

create or replace function public.has_role(allowed_roles text[])
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$ select exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role::text=any(allowed_roles)) $$;

create or replace function public.is_chapter_member(check_chapter_id uuid, allowed_roles text[])
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$ select exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.chapter_id=check_chapter_id and r.role::text=any(allowed_roles)) $$;

create or replace function public.is_event_assigned(check_event_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$ select exists(select 1 from public.event_assignments a where a.event_id=check_event_id and a.user_id=auth.uid() and a.assignment_role='event_coordinator') $$;

create or replace function public.can_manage_event(check_event_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select public.has_role(array['super_admin','admin'])
    or exists(select 1 from public.events e where e.id=check_event_id and public.is_chapter_member(e.chapter_id,array['chapter_coordinator']))
    or public.is_event_assigned(check_event_id)
$$;

revoke all on function public.has_role(text[]) from public, anon;
revoke all on function public.is_chapter_member(uuid,text[]) from public, anon;
revoke all on function public.is_event_assigned(uuid) from public, anon;
revoke all on function public.can_manage_event(uuid) from public, anon;
grant execute on function public.has_role(text[]), public.is_chapter_member(uuid,text[]), public.is_event_assigned(uuid), public.can_manage_event(uuid) to authenticated;

-- Role changes must pass through the audited admin_manage_user_role RPC from
-- 20260909000200; direct writes would bypass self/final-Super-Admin safeguards.
drop policy user_roles_insert on public.user_roles;
drop policy user_roles_update on public.user_roles;
drop policy user_roles_delete on public.user_roles;
revoke insert, update, delete on public.user_roles from authenticated, anon;

-- Replace only policy names verified in the authoritative schema snapshot.
drop policy chapters_select on public.chapters;
create policy chapters_select_rbac on public.chapters for select to authenticated using (
  public.has_role(array['super_admin','admin','chapter_coordinator','event_coordinator','volunteer'])
  and (status='active' or public.has_role(array['super_admin','admin']) or public.is_chapter_member(id,array['chapter_coordinator']))
);
create policy chapters_insert_rbac on public.chapters for insert to authenticated with check (public.has_role(array['super_admin','admin']));
create policy chapters_update_rbac on public.chapters for update to authenticated
  using (public.has_role(array['super_admin','admin']) or public.is_chapter_member(id,array['chapter_coordinator']))
  with check (public.has_role(array['super_admin','admin']) or public.is_chapter_member(id,array['chapter_coordinator']));
create policy chapters_delete_rbac on public.chapters for delete to authenticated using (public.has_role(array['super_admin','admin']));

drop policy profiles_select on public.profiles;
drop policy profiles_update on public.profiles;
create policy profiles_select_rbac on public.profiles for select to authenticated using (id=auth.uid() or public.has_role(array['super_admin','admin']));
create policy profiles_update_own_rbac on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());

drop policy events_select on public.events;
drop policy events_insert on public.events;
drop policy events_update on public.events;
drop policy events_delete on public.events;
create policy events_select_rbac on public.events for select to authenticated using (
  public.has_role(array['super_admin','admin']) or public.is_chapter_member(chapter_id,array['chapter_coordinator']) or public.is_event_assigned(id)
);
create policy events_insert_rbac on public.events for insert to authenticated with check (
  created_by=auth.uid() and (public.has_role(array['super_admin','admin']) or public.is_chapter_member(chapter_id,array['chapter_coordinator']))
);
create policy events_update_rbac on public.events for update to authenticated
  using (public.has_role(array['super_admin','admin']) or public.is_chapter_member(chapter_id,array['chapter_coordinator']) or public.is_event_assigned(id))
  with check (public.has_role(array['super_admin','admin']) or public.is_chapter_member(chapter_id,array['chapter_coordinator']) or public.is_event_assigned(id));
create policy events_delete_rbac on public.events for delete to authenticated using (
  public.has_role(array['super_admin','admin']) or public.is_chapter_member(chapter_id,array['chapter_coordinator'])
);

drop policy volunteers_select on public.volunteers;
drop policy volunteers_insert on public.volunteers;
drop policy volunteers_update on public.volunteers;
create policy volunteers_select_rbac on public.volunteers for select to authenticated using (
  public.has_role(array['super_admin','admin']) or public.is_chapter_member(chapter_id,array['chapter_coordinator']) or profile_id=auth.uid()
);
create policy volunteers_insert_own_rbac on public.volunteers for insert to authenticated with check (profile_id=auth.uid());
create policy volunteers_update_rbac on public.volunteers for update to authenticated
  using (public.has_role(array['super_admin','admin']) or public.is_chapter_member(chapter_id,array['chapter_coordinator']))
  with check (public.has_role(array['super_admin','admin']) or public.is_chapter_member(chapter_id,array['chapter_coordinator']));

drop policy inventory_select on public.inventory;
drop policy inventory_insert on public.inventory;
drop policy inventory_update on public.inventory;
create policy inventory_select_rbac on public.inventory for select to authenticated using (
  public.has_role(array['super_admin','admin']) or public.is_chapter_member(chapter_id,array['chapter_coordinator'])
  or exists(select 1 from public.events e join public.event_assignments a on a.event_id=e.id where e.chapter_id=inventory.chapter_id and a.user_id=auth.uid())
);
create policy inventory_insert_rbac on public.inventory for insert to authenticated with check (public.has_role(array['super_admin','admin']) or public.is_chapter_member(chapter_id,array['chapter_coordinator']));
create policy inventory_update_rbac on public.inventory for update to authenticated using (public.has_role(array['super_admin','admin']) or public.is_chapter_member(chapter_id,array['chapter_coordinator'])) with check (public.has_role(array['super_admin','admin']) or public.is_chapter_member(chapter_id,array['chapter_coordinator']));
create policy inventory_delete_rbac on public.inventory for delete to authenticated using (public.has_role(array['super_admin','admin']) or public.is_chapter_member(chapter_id,array['chapter_coordinator']));

drop policy inventory_requests_select on public.inventory_requests;
drop policy inventory_requests_insert on public.inventory_requests;
drop policy inventory_requests_update on public.inventory_requests;
create policy inventory_requests_select_rbac on public.inventory_requests for select to authenticated using (
  requested_by=auth.uid() or public.has_role(array['super_admin','admin']) or exists(select 1 from public.inventory i where i.id=inventory_id and public.is_chapter_member(i.chapter_id,array['chapter_coordinator']))
);
create policy inventory_requests_insert_own_rbac on public.inventory_requests for insert to authenticated with check (requested_by=auth.uid() and public.has_role(array['volunteer','event_coordinator']));
create policy inventory_requests_update_manager_rbac on public.inventory_requests for update to authenticated using (
  public.has_role(array['super_admin','admin']) or exists(select 1 from public.inventory i where i.id=inventory_id and public.is_chapter_member(i.chapter_id,array['chapter_coordinator']))
) with check (
  public.has_role(array['super_admin','admin']) or exists(select 1 from public.inventory i where i.id=inventory_id and public.is_chapter_member(i.chapter_id,array['chapter_coordinator']))
);

drop policy audit_logs_insert on public.audit_logs;
drop policy audit_logs_select on public.audit_logs;
create policy audit_logs_select_rbac on public.audit_logs for select to authenticated using (public.has_role(array['super_admin','admin']));
-- Audit rows are written only by constrained security-definer functions/service role.
revoke insert, update, delete on public.audit_logs from authenticated, anon;

-- Existing broad AI/knowledge policies are removed only after exact-name preflight above.
drop policy "Anyone can view settings" on public.ai_settings;
drop policy "Anyone can insert settings" on public.ai_settings;
drop policy "Anyone can update settings" on public.ai_settings;
create policy ai_settings_superadmin_rbac on public.ai_settings for all to authenticated using (public.has_role(array['super_admin'])) with check (public.has_role(array['super_admin']));
revoke all on public.ai_settings from anon;
grant select, insert, update, delete on public.ai_settings to authenticated;

drop policy documents_modify_authenticated on public.documents;
create policy documents_modify_admin_rbac on public.documents for all to authenticated using (public.has_role(array['super_admin','admin'])) with check (public.has_role(array['super_admin','admin']));
drop policy documents_select_authenticated on public.documents;
create policy documents_select_approved_rbac on public.documents for select to authenticated using (
  public.has_role(array['super_admin','admin','chapter_coordinator','event_coordinator','volunteer'])
);
revoke all on public.documents from anon;
grant select, insert, update, delete on public.documents to authenticated;

drop policy "Users can view knowledge base" on public.knowledge_base;
drop policy "Users can insert knowledge base" on public.knowledge_base;
drop policy "Users can delete knowledge base" on public.knowledge_base;
create policy knowledge_base_select_approved_rbac on public.knowledge_base for select to authenticated using (
  public.has_role(array['super_admin','admin','chapter_coordinator','event_coordinator','volunteer'])
);
create policy knowledge_base_modify_admin_rbac on public.knowledge_base for all to authenticated
  using (public.has_role(array['super_admin','admin']))
  with check (public.has_role(array['super_admin','admin']));
revoke all on public.knowledge_base from anon;
revoke all on sequence public.knowledge_base_id_seq from anon;
grant select, insert, update, delete on public.knowledge_base to authenticated;
grant usage, select on sequence public.knowledge_base_id_seq to authenticated;

drop policy "Users can insert suggestions" on public.ai_faq_suggestions;
drop policy "Users can update suggestions" on public.ai_faq_suggestions;
drop policy "Users can delete suggestions" on public.ai_faq_suggestions;
drop policy "Users can view suggestions" on public.ai_faq_suggestions;
create policy faq_suggestions_manage_admin_rbac on public.ai_faq_suggestions for all to authenticated using (public.has_role(array['super_admin','admin'])) with check (public.has_role(array['super_admin','admin']));
revoke all on public.ai_faq_suggestions from anon;
revoke all on sequence public.ai_faq_suggestions_id_seq from anon;
grant select, insert, update, delete on public.ai_faq_suggestions to authenticated;
grant usage, select on sequence public.ai_faq_suggestions_id_seq to authenticated;

drop policy event_tasks_modify_authenticated on public.event_tasks;
drop policy event_tasks_select_authenticated on public.event_tasks;
create policy event_tasks_select_rbac on public.event_tasks for select to authenticated using (
  public.can_manage_event(event_id) or assigned_to=auth.uid()
);
create policy event_tasks_insert_rbac on public.event_tasks for insert to authenticated with check (public.can_manage_event(event_id));
create policy event_tasks_update_rbac on public.event_tasks for update to authenticated
  using (public.can_manage_event(event_id) or assigned_to=auth.uid())
  with check (public.can_manage_event(event_id) or assigned_to=auth.uid());
create policy event_tasks_delete_rbac on public.event_tasks for delete to authenticated using (public.can_manage_event(event_id));
revoke all on public.event_tasks from anon;

-- The table has no event/chapter foreign key, so coordinator scope cannot be enforced safely yet.
drop policy social_media_posts_modify_authenticated on public.social_media_posts;
drop policy social_media_posts_select_authenticated on public.social_media_posts;
create policy social_media_posts_admin_rbac on public.social_media_posts for all to authenticated
  using (public.has_role(array['super_admin','admin']))
  with check (public.has_role(array['super_admin','admin']));
revoke all on public.social_media_posts from anon;

-- Verification: review results before any remote application.
-- select tablename, policyname, roles, cmd from pg_policies where schemaname='public' order by tablename, policyname;
-- select proname, prosecdef, proconfig from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='public' and proname in ('has_role','is_chapter_member','is_event_assigned','can_manage_event');

commit;

-- Rollback: restore the exact policies/functions from the retained authoritative schema backup.
-- Never roll back by disabling RLS. Preserve audit rows and existing operational data.
