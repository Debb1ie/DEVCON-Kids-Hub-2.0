create extension if not exists pgcrypto;
-- Enums
create type public.app_role as enum (
  'super_admin',
  'admin',
  'chapter_coordinator',
  'event_coordinator',
  'volunteer',
  'pending_volunteer'
);
create type public.approval_status as enum ('pending', 'approved', 'rejected');
create type public.event_status as enum ('Draft', 'Scheduled', 'Completed', 'Cancelled');
create type public.inventory_status as enum ('In Stock', 'Low Stock', 'Out of Stock');
create type public.request_status as enum ('pending', 'approved', 'rejected', 'fulfilled');
-- Chapters (Updated with Frontend requirements)
create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  learners integer not null default 0,
  workshops integer not null default 0,
  completion integer not null default 0,
  color text not null default '#8B5CF6',
  created_at timestamptz not null default now()
);
-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now()
);
-- User Roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  chapter_id uuid references public.chapters(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, role, chapter_id)
);
create index idx_user_roles_user_id on public.user_roles(user_id);
create index idx_user_roles_chapter_id on public.user_roles(chapter_id);
-- Events (Updated with Frontend Drive & Image requirements)
create table public.events (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references public.chapters(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  
  -- GUIDE FOR FRONTEND: Events.jsx sends `chapter` and `coordinator` as text strings. 
  -- Ideally, the UI should use dropdowns linked to `chapters.id` and `auth.users.id` (or `volunteers.profile_id`)
  title text not null,
  type text,
  chapter text,
  coordinator text,
  
  description text,
  image_url text,
  status public.event_status not null default 'Scheduled',
  event_date date,
  google_folder_name text,
  google_folder_path text,
  google_assets_path text,
  google_folder_status text,
  created_at timestamptz not null default now()
);
create index idx_events_chapter_id on public.events(chapter_id);
-- Post Event Reports
create table public.post_event_reports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  ocr_data jsonb,
  finalized boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_reports_event_id on public.post_event_reports(event_id);
-- Volunteers
create table public.volunteers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete restrict,
  
  -- GUIDE FOR FRONTEND: The React app (Volunteers.jsx) currently sends raw text for these fields.
  -- Ideally, it should send `profile_id` and `chapter_id` instead.
  name text,
  role text,
  chapter text,
  status text,
  
  approval_status public.approval_status not null default 'pending',
  ladder_stage text not null default 'team_member' check (ladder_stage in ('team_member', 'associate', 'specialist', 'lead')),
  created_at timestamptz not null default now()
);
create index idx_volunteers_chapter_id on public.volunteers(chapter_id);
-- Onboarding Progress
create table public.volunteer_onboarding_progress (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references public.volunteers(id) on delete cascade,
  step text not null check (step in ('orientation', 'guidelines', 'role_training')),
  completed boolean not null default false,
  completed_at timestamptz,
  unique (volunteer_id, step)
);
-- Inventory
create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references public.chapters(id) on delete restrict,
  
  -- GUIDE FOR FRONTEND: Inventory.jsx sends these fields. It should ideally map `chapter` string to a `chapter_id`.
  name text,
  category text,
  stock integer not null default 0 check (stock >= 0),
  image_url text,
  status public.inventory_status not null default 'In Stock',
  
  created_at timestamptz not null default now()
);
create index idx_inventory_chapter_id on public.inventory(chapter_id);
-- Inventory Requests
create table public.inventory_requests (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventory(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete restrict,
  quantity_requested integer not null check (quantity_requested > 0),
  status public.request_status not null default 'pending',
  created_at timestamptz not null default now()
);
-- Audit Logs
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_table text not null,
  target_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_logs_target on public.audit_logs(target_table, target_id);
-- User Signup Trigger
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, avatar_url)
  values (new.id, new.raw_user_meta_data->>'full_name', new.email, new.raw_user_meta_data->>'avatar_url');
  insert into public.user_roles (user_id, role) values (new.id, 'pending_volunteer');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
-- RLS Helper Functions
create or replace function public.has_role(allowed_roles text[]) returns boolean language sql security definer stable as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role::text = any(allowed_roles));
$$;
create or replace function public.is_chapter_member(check_chapter_id uuid, allowed_roles text[]) returns boolean language sql security definer stable as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and chapter_id = check_chapter_id and role::text = any(allowed_roles));
$$;
-- RLS Policies
alter table public.chapters enable row level security;
create policy "chapters_select" on public.chapters for select using (true);
alter table public.profiles enable row level security;
create policy "profiles_select" on public.profiles for select using (true);
create policy "profiles_update" on public.profiles for update using (id = auth.uid());
alter table public.user_roles enable row level security;
create policy "user_roles_select" on public.user_roles for select using (user_id = auth.uid() or public.has_role(array['super_admin', 'admin']));
create policy "user_roles_insert" on public.user_roles for insert with check (public.has_role(array['super_admin']));
create policy "user_roles_update" on public.user_roles for update using (public.has_role(array['super_admin']));
create policy "user_roles_delete" on public.user_roles for delete using (public.has_role(array['super_admin']));
alter table public.events enable row level security;
create policy "events_select" on public.events for select using (public.has_role(array['super_admin', 'admin']) or public.is_chapter_member(chapter_id, array['chapter_coordinator', 'event_coordinator']));
create policy "events_insert" on public.events for insert with check (public.has_role(array['super_admin', 'admin']) or public.is_chapter_member(chapter_id, array['chapter_coordinator', 'event_coordinator']));
create policy "events_update" on public.events for update using (public.has_role(array['super_admin', 'admin']) or public.is_chapter_member(chapter_id, array['chapter_coordinator']) or (public.is_chapter_member(chapter_id, array['event_coordinator']) and created_by = auth.uid()));
create policy "events_delete" on public.events for delete using (public.has_role(array['super_admin', 'admin']) or public.is_chapter_member(chapter_id, array['chapter_coordinator']) or (public.has_role(array['event_coordinator']) and created_by = auth.uid()));
alter table public.post_event_reports enable row level security;
create policy "reports_select" on public.post_event_reports for select using (public.has_role(array['super_admin', 'admin']) or exists (select 1 from public.events e where e.id = event_id and public.is_chapter_member(e.chapter_id, array['chapter_coordinator'])) or submitted_by = auth.uid());
create policy "reports_insert" on public.post_event_reports for insert with check (public.has_role(array['super_admin', 'admin']) or exists (select 1 from public.events e where e.id = event_id and public.is_chapter_member(e.chapter_id, array['chapter_coordinator'])) or (public.has_role(array['event_coordinator']) and submitted_by = auth.uid()));
create policy "reports_update" on public.post_event_reports for update using (public.has_role(array['super_admin', 'admin']) or exists (select 1 from public.events e where e.id = event_id and public.is_chapter_member(e.chapter_id, array['chapter_coordinator'])) or submitted_by = auth.uid());
alter table public.volunteers enable row level security;
create policy "volunteers_select" on public.volunteers for select using (public.has_role(array['super_admin', 'admin']) or public.is_chapter_member(chapter_id, array['chapter_coordinator']) or profile_id = auth.uid());
create policy "volunteers_insert" on public.volunteers for insert with check (profile_id = auth.uid());
create policy "volunteers_update" on public.volunteers for update using (public.has_role(array['super_admin', 'admin']) or public.is_chapter_member(chapter_id, array['chapter_coordinator']));
alter table public.volunteer_onboarding_progress enable row level security;
create policy "onboarding_select" on public.volunteer_onboarding_progress for select using (public.has_role(array['super_admin', 'admin']) or exists (select 1 from public.volunteers v where v.id = volunteer_id and public.is_chapter_member(v.chapter_id, array['chapter_coordinator'])) or exists (select 1 from public.volunteers v where v.id = volunteer_id and v.profile_id = auth.uid()));
create policy "onboarding_update" on public.volunteer_onboarding_progress for update using (exists (select 1 from public.volunteers v where v.id = volunteer_id and v.profile_id = auth.uid()));
alter table public.inventory enable row level security;
create policy "inventory_select" on public.inventory for select using (public.has_role(array['super_admin', 'admin']) or public.is_chapter_member(chapter_id, array['chapter_coordinator', 'event_coordinator']));
create policy "inventory_insert" on public.inventory for insert with check (public.has_role(array['super_admin', 'admin']) or public.is_chapter_member(chapter_id, array['chapter_coordinator']));
create policy "inventory_update" on public.inventory for update using (public.has_role(array['super_admin', 'admin']) or public.is_chapter_member(chapter_id, array['chapter_coordinator']));
alter table public.inventory_requests enable row level security;
create policy "inventory_requests_select" on public.inventory_requests for select using (public.has_role(array['super_admin', 'admin']) or exists (select 1 from public.inventory i where i.id = inventory_id and public.is_chapter_member(i.chapter_id, array['chapter_coordinator'])) or requested_by = auth.uid());
create policy "inventory_requests_insert" on public.inventory_requests for insert with check (requested_by = auth.uid());
create policy "inventory_requests_update" on public.inventory_requests for update using (public.has_role(array['super_admin', 'admin']) or exists (select 1 from public.inventory i where i.id = inventory_id and public.is_chapter_member(i.chapter_id, array['chapter_coordinator'])));
alter table public.audit_logs enable row level security;
create policy "audit_logs_select" on public.audit_logs for select using (public.has_role(array['super_admin', 'admin']));
create policy "audit_logs_insert" on public.audit_logs for insert with check (true);