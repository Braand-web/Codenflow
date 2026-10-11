-- Coden flow: private project metadata. Apply once to the linked Supabase project.
begin;
create table public.codenflow_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  brief text not null check (char_length(btrim(brief)) between 1 and 8000),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index codenflow_projects_owner_created_idx on public.codenflow_projects(owner_id, created_at desc);
alter table public.codenflow_projects enable row level security;
revoke all on public.codenflow_projects from anon, authenticated;
grant select, insert on public.codenflow_projects to authenticated;
grant all on public.codenflow_projects to service_role;
create policy projects_read_own on public.codenflow_projects for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy projects_create_own on public.codenflow_projects for insert to authenticated
  with check ((select auth.uid()) = owner_id);
comment on table public.codenflow_projects is 'Private Coden flow project briefs. Authenticated owners may read and create their own rows.';
commit;
