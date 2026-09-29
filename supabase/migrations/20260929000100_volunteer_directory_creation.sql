-- REVIEW ONLY. Enables authorized managers to create manual directory records.
-- Do not apply automatically; inspect the existing production data first.
begin;

update public.volunteers
set role = btrim(role),
status = lower(trim(status))
where role is not null or status is not null;

alter table public.volunteers
  add constraint volunteers_role_free_text check (btrim(role) <> '' and char_length(role) <= 100) not valid,
  add constraint volunteers_status_canonical check (status in ('pending','approved','rejected','active','inactive')) not valid,
  add constraint volunteers_directory_fields_required check (
    name is not null and btrim(name) <> '' and role is not null and chapter_id is not null and status is not null
  ) not valid;

drop policy if exists volunteers_insert_own_rbac on public.volunteers;
create policy volunteers_insert_rbac on public.volunteers for insert to authenticated with check (
  public.has_role(array['super_admin','admin'])
  or public.is_chapter_member(chapter_id,array['chapter_coordinator'])
);

-- Manual directory entries intentionally keep profile_id nullable. They are not
-- authentication accounts and no synthetic auth.users identifier is generated.

commit;

-- Rollback: drop the three constraints and volunteers_insert_rbac, then restore
-- volunteers_insert_own_rbac with check (profile_id=auth.uid()). Do not disable RLS.
