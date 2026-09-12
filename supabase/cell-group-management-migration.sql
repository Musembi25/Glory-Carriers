-- Cell Group Management migration
-- Run this in the Supabase SQL Editor after schema.sql

-- Enums
do $$ begin
  create type public.membership_status as enum (
    'active', 'new', 'temporarily_inactive', 'left', 'removed'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.discipleship_mgmt_status as enum (
    'yes', 'no', 'in_progress', 'not_started', 'unknown'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.join_request_status as enum (
    'pending', 'approved', 'declined'
  );
exception when duplicate_object then null;
end $$;

-- Cell groups (single workspace = one primary group)
create table if not exists public.cell_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Cell Group' check (char_length(trim(name)) > 0),
  description text not null default '',
  leader_id uuid references public.profiles (id) on delete set null,
  allow_join_requests boolean not null default true,
  allow_member_invitations boolean not null default true,
  require_leader_approval boolean not null default true,
  visibility text not null default 'members_only'
    check (visibility in ('public', 'members_only', 'private')),
  timezone text not null default 'UTC',
  default_language text not null default 'en',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Membership records (links profiles to cell group with admin metadata)
create table if not exists public.cell_group_members (
  id uuid primary key default gen_random_uuid(),
  cell_group_id uuid not null references public.cell_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  date_of_birth date,
  departments text[] not null default '{}',
  custom_department text,
  favorite_food text,
  joined_month smallint check (joined_month is null or (joined_month between 1 and 12)),
  joined_year smallint check (joined_year is null or (joined_year between 1900 and 2100)),
  joined_date date,
  discipleship_status public.discipleship_mgmt_status not null default 'unknown',
  membership_status public.membership_status not null default 'active',
  phone text,
  gender text,
  bio text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (cell_group_id, user_id)
);

create index if not exists idx_cell_group_members_group
  on public.cell_group_members (cell_group_id);
create index if not exists idx_cell_group_members_user
  on public.cell_group_members (user_id);
create index if not exists idx_cell_group_members_status
  on public.cell_group_members (cell_group_id, membership_status);

-- Join requests
create table if not exists public.cell_group_join_requests (
  id uuid primary key default gen_random_uuid(),
  cell_group_id uuid not null references public.cell_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  message text not null default '',
  status public.join_request_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (cell_group_id, user_id, status)
);

create index if not exists idx_cell_group_join_requests_pending
  on public.cell_group_join_requests (cell_group_id, status)
  where status = 'pending';

-- Invitations for users not yet registered
create table if not exists public.cell_group_invitations (
  id uuid primary key default gen_random_uuid(),
  cell_group_id uuid not null references public.cell_groups (id) on delete cascade,
  email text not null check (char_length(trim(email)) > 0),
  full_name text not null default '',
  invited_by uuid not null references public.profiles (id) on delete cascade,
  membership_data jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'cancelled')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (cell_group_id, email)
);

-- Group rules
create table if not exists public.cell_group_rules (
  id uuid primary key default gen_random_uuid(),
  cell_group_id uuid not null references public.cell_groups (id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  content text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_cell_group_rules_sort
  on public.cell_group_rules (cell_group_id, sort_order);

-- Activity log (read-only for leaders)
create table if not exists public.cell_group_activity_log (
  id uuid primary key default gen_random_uuid(),
  cell_group_id uuid not null references public.cell_groups (id) on delete cascade,
  action_type text not null,
  description text not null default '',
  affected_user_id uuid references public.profiles (id) on delete set null,
  performed_by uuid not null references public.profiles (id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_cell_group_activity_log_group
  on public.cell_group_activity_log (cell_group_id, created_at desc);

-- Helper functions
create or replace function public.is_cell_group_leader(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cell_groups
    where id = p_group_id
      and leader_id = auth.uid()
  );
$$;

create or replace function public.can_manage_cell_group(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or public.is_cell_group_leader(p_group_id);
$$;

create or replace function public.is_cell_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cell_group_members
    where cell_group_id = p_group_id
      and user_id = auth.uid()
      and membership_status in ('active', 'new', 'temporarily_inactive')
  );
$$;

-- Ensure default cell group exists (first admin becomes leader)
create or replace function public.ensure_default_cell_group()
returns public.cell_groups
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_group public.cell_groups;
  default_leader uuid;
begin
  select * into existing_group
  from public.cell_groups
  order by created_at asc
  limit 1;

  if existing_group.id is not null then
    return existing_group;
  end if;

  select id into default_leader
  from public.profiles
  where role = 'admin' and is_active = true
  order by created_at asc
  limit 1;

  if default_leader is null then
    select id into default_leader
    from public.profiles
    where is_active = true
    order by created_at asc
    limit 1;
  end if;

  insert into public.cell_groups (name, description, leader_id)
  values ('Cell Group', 'Our cell group community', default_leader)
  returning * into existing_group;

  return existing_group;
end;
$$;

-- Log activity helper
create or replace function public.log_cell_group_activity(
  p_group_id uuid,
  p_action_type text,
  p_description text,
  p_affected_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  insert into public.cell_group_activity_log (
    cell_group_id,
    action_type,
    description,
    affected_user_id,
    performed_by,
    metadata
  ) values (
    p_group_id,
    p_action_type,
    p_description,
    p_affected_user_id,
    auth.uid(),
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

-- Updated_at triggers
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists cell_groups_updated_at on public.cell_groups;
create trigger cell_groups_updated_at
  before update on public.cell_groups
  for each row execute function public.set_updated_at();

drop trigger if exists cell_group_members_updated_at on public.cell_group_members;
create trigger cell_group_members_updated_at
  before update on public.cell_group_members
  for each row execute function public.set_updated_at();

drop trigger if exists cell_group_rules_updated_at on public.cell_group_rules;
create trigger cell_group_rules_updated_at
  before update on public.cell_group_rules
  for each row execute function public.set_updated_at();

-- RLS
alter table public.cell_groups enable row level security;
alter table public.cell_group_members enable row level security;
alter table public.cell_group_join_requests enable row level security;
alter table public.cell_group_invitations enable row level security;
alter table public.cell_group_rules enable row level security;
alter table public.cell_group_activity_log enable row level security;

-- cell_groups policies
drop policy if exists "cell_groups_select" on public.cell_groups;
create policy "cell_groups_select"
on public.cell_groups for select to authenticated
using (
  public.is_admin()
  or public.is_cell_group_leader(id)
  or public.is_cell_group_member(id)
);

drop policy if exists "cell_groups_manage" on public.cell_groups;
create policy "cell_groups_manage"
on public.cell_groups for all to authenticated
using (public.can_manage_cell_group(id))
with check (public.can_manage_cell_group(id));

-- cell_group_members policies
drop policy if exists "cell_group_members_select" on public.cell_group_members;
create policy "cell_group_members_select"
on public.cell_group_members for select to authenticated
using (
  public.is_admin()
  or public.is_cell_group_leader(cell_group_id)
  or public.is_cell_group_member(cell_group_id)
  or user_id = auth.uid()
);

drop policy if exists "cell_group_members_manage" on public.cell_group_members;
create policy "cell_group_members_manage"
on public.cell_group_members for all to authenticated
using (public.can_manage_cell_group(cell_group_id))
with check (public.can_manage_cell_group(cell_group_id));

-- join requests
drop policy if exists "cell_group_join_requests_select" on public.cell_group_join_requests;
create policy "cell_group_join_requests_select"
on public.cell_group_join_requests for select to authenticated
using (
  public.can_manage_cell_group(cell_group_id)
  or user_id = auth.uid()
);

drop policy if exists "cell_group_join_requests_insert" on public.cell_group_join_requests;
create policy "cell_group_join_requests_insert"
on public.cell_group_join_requests for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.cell_groups g
    where g.id = cell_group_id
      and g.allow_join_requests = true
  )
);

drop policy if exists "cell_group_join_requests_manage" on public.cell_group_join_requests;
create policy "cell_group_join_requests_manage"
on public.cell_group_join_requests for update to authenticated
using (public.can_manage_cell_group(cell_group_id))
with check (public.can_manage_cell_group(cell_group_id));

-- invitations
drop policy if exists "cell_group_invitations_select" on public.cell_group_invitations;
create policy "cell_group_invitations_select"
on public.cell_group_invitations for select to authenticated
using (public.can_manage_cell_group(cell_group_id));

drop policy if exists "cell_group_invitations_manage" on public.cell_group_invitations;
create policy "cell_group_invitations_manage"
on public.cell_group_invitations for all to authenticated
using (public.can_manage_cell_group(cell_group_id))
with check (public.can_manage_cell_group(cell_group_id));

-- rules
drop policy if exists "cell_group_rules_select" on public.cell_group_rules;
create policy "cell_group_rules_select"
on public.cell_group_rules for select to authenticated
using (
  public.can_manage_cell_group(cell_group_id)
  or public.is_cell_group_member(cell_group_id)
);

drop policy if exists "cell_group_rules_manage" on public.cell_group_rules;
create policy "cell_group_rules_manage"
on public.cell_group_rules for all to authenticated
using (public.can_manage_cell_group(cell_group_id))
with check (public.can_manage_cell_group(cell_group_id));

-- activity log (read-only for leaders, insert via function)
drop policy if exists "cell_group_activity_log_select" on public.cell_group_activity_log;
create policy "cell_group_activity_log_select"
on public.cell_group_activity_log for select to authenticated
using (public.can_manage_cell_group(cell_group_id));

drop policy if exists "cell_group_activity_log_insert" on public.cell_group_activity_log;
create policy "cell_group_activity_log_insert"
on public.cell_group_activity_log for insert to authenticated
with check (public.can_manage_cell_group(cell_group_id));

-- Realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cell_groups'
  ) then
    alter publication supabase_realtime add table public.cell_groups;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cell_group_members'
  ) then
    alter publication supabase_realtime add table public.cell_group_members;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cell_group_join_requests'
  ) then
    alter publication supabase_realtime add table public.cell_group_join_requests;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cell_group_rules'
  ) then
    alter publication supabase_realtime add table public.cell_group_rules;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cell_group_activity_log'
  ) then
    alter publication supabase_realtime add table public.cell_group_activity_log;
  end if;
end $$;

-- Provision default group
select public.ensure_default_cell_group();
