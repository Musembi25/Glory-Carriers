-- Adds a database-owned Super Admin registry and audited privileged actions.
-- Do not assign a Super Admin from client code. Bootstrap only a verified active
-- account by calling bootstrap_super_admin(uuid) as the database owner.

create table if not exists public.super_admin_members (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  granted_at timestamptz not null default timezone('utc', now()),
  granted_by uuid references public.profiles (id) on delete set null
);

alter table public.super_admin_members enable row level security;
revoke all on public.super_admin_members from anon, authenticated;
grant select on public.super_admin_members to authenticated;

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
on public.profiles
for insert to authenticated
with check (auth.uid() = id and role = 'user' and is_active = true);

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.super_admin_members super_admin
    join public.profiles member on member.id = super_admin.user_id
    where super_admin.user_id = auth.uid()
      and member.role = 'admin'
      and member.is_active = true
  );
$$;
revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;

drop policy if exists "super_admin_members_select_super_admin" on public.super_admin_members;
create policy "super_admin_members_select_super_admin"
on public.super_admin_members
for select to authenticated
using (public.is_super_admin());

create table if not exists public.super_admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles (id) on delete restrict,
  action text not null check (action in ('admin_role_granted', 'admin_role_revoked', 'member_paused', 'member_restored')),
  target_user_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_super_admin_audit_logs_created_at
  on public.super_admin_audit_logs (created_at desc);

alter table public.super_admin_audit_logs enable row level security;
alter table public.super_admin_audit_logs alter column actor_id drop not null;
alter table public.super_admin_audit_logs drop constraint if exists super_admin_audit_logs_action_check;
alter table public.super_admin_audit_logs
  add constraint super_admin_audit_logs_action_check
  check (action in ('admin_role_granted', 'admin_role_revoked', 'member_paused', 'member_restored', 'admin_bootstrap_granted', 'super_admin_bootstrapped', 'member_deleted'));
revoke all on public.super_admin_audit_logs from anon, authenticated;
grant select on public.super_admin_audit_logs to authenticated;

drop policy if exists "super_admin_audit_logs_select_super_admin" on public.super_admin_audit_logs;
create policy "super_admin_audit_logs_select_super_admin"
on public.super_admin_audit_logs
for select to authenticated
using (public.is_super_admin());

create or replace function public.guard_sensitive_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if (new.role is distinct from 'user'::public.app_role or new.is_active is distinct from true)
       and not (auth.uid() is null and coalesce(current_setting('app.admin_bootstrap_profile_insert', true), 'false') = 'true') then
      raise exception 'New member profiles must start with standard member access.';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role
     and not (
       (public.is_super_admin() and coalesce(current_setting('app.super_admin_role_change', true), 'false') = 'true')
       or (auth.uid() is null and coalesce(current_setting('app.admin_bootstrap_role_change', true), 'false') = 'true')
     ) then
    raise exception 'Administrator roles can only be changed through the audited Super Admin controls.';
  end if;

  if new.is_active is distinct from old.is_active
     and not (
       (public.is_super_admin() and coalesce(current_setting('app.super_admin_access_change', true), 'false') = 'true')
       or (auth.uid() is null and coalesce(current_setting('app.admin_bootstrap_access_change', true), 'false') = 'true')
     ) then
    raise exception 'Member access can only be changed through the audited Super Admin controls.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_sensitive_profile_changes on public.profiles;
drop trigger if exists guard_sensitive_profile_insert on public.profiles;
create trigger guard_sensitive_profile_insert
before insert on public.profiles
for each row execute function public.guard_sensitive_profile_changes();
create trigger guard_sensitive_profile_changes
before update of role, is_active on public.profiles
for each row execute function public.guard_sensitive_profile_changes();

create or replace function public.super_admin_set_admin_role(target_user_id uuid, grant_admin boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_is_super_admin boolean;
  admin_count bigint;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Super Admin access is required.';
  end if;
  if target_user_id is null then
    raise exception 'A member account is required.';
  end if;

  select exists (select 1 from public.super_admin_members where user_id = target_user_id)
  into target_is_super_admin;
  if target_is_super_admin and not grant_admin then
    raise exception 'A Super Admin account cannot be demoted here.';
  end if;

  if not grant_admin then
    select count(*) into admin_count from public.profiles where role = 'admin' and is_active = true;
    if admin_count <= 1 then
      raise exception 'At least one active administrator must remain.';
    end if;
  end if;

  perform set_config('app.super_admin_role_change', 'true', true);
  update public.profiles
  set role = case when grant_admin then 'admin'::public.app_role else 'user'::public.app_role end
  where id = target_user_id;
  if not found then
    raise exception 'Member account not found.';
  end if;

  insert into public.super_admin_audit_logs (actor_id, action, target_user_id, metadata)
  values (
    auth.uid(),
    case when grant_admin then 'admin_role_granted' else 'admin_role_revoked' end,
    target_user_id,
    jsonb_build_object('role', case when grant_admin then 'admin' else 'user' end)
  );
end;
$$;
revoke all on function public.super_admin_set_admin_role(uuid, boolean) from public, anon;
grant execute on function public.super_admin_set_admin_role(uuid, boolean) to authenticated;

create or replace function public.super_admin_set_member_active(target_user_id uuid, target_active boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_is_super_admin boolean;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Super Admin access is required.';
  end if;
  if target_user_id is null or target_active is null then
    raise exception 'A member and access state are required.';
  end if;
  if target_user_id = auth.uid() and not target_active then
    raise exception 'You cannot pause your own Super Admin account.';
  end if;

  select exists (select 1 from public.super_admin_members where user_id = target_user_id)
  into target_is_super_admin;
  if target_is_super_admin and not target_active then
    raise exception 'A Super Admin account cannot be paused here.';
  end if;

  perform set_config('app.super_admin_access_change', 'true', true);
  update public.profiles set is_active = target_active where id = target_user_id;
  if not found then
    raise exception 'Member account not found.';
  end if;

  insert into public.super_admin_audit_logs (actor_id, action, target_user_id, metadata)
  values (
    auth.uid(),
    case when target_active then 'member_restored' else 'member_paused' end,
    target_user_id,
    jsonb_build_object('is_active', target_active)
  );
end;
$$;
revoke all on function public.super_admin_set_member_active(uuid, boolean) from public, anon;
grant execute on function public.super_admin_set_member_active(uuid, boolean) to authenticated;

create or replace function public.admin_delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare target_profile public.profiles;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Super Admin privileges are required.';
  end if;
  if target_user_id is null then raise exception 'A target user id is required.'; end if;
  if target_user_id = auth.uid() then raise exception 'You cannot delete your own Super Admin account.'; end if;

  select * into target_profile from public.profiles where id = target_user_id limit 1;
  if target_profile.id is null then raise exception 'The selected user was not found.'; end if;
  if exists (select 1 from public.super_admin_members where user_id = target_user_id) then
    raise exception 'A Super Admin account cannot be deleted here.';
  end if;
  if target_profile.role = 'admin'
     and (select count(*) from public.profiles where role = 'admin' and is_active = true) <= 1 then
    raise exception 'Keep at least one active admin account in the system.';
  end if;

  insert into public.super_admin_audit_logs (actor_id, action, target_user_id, metadata)
  values (
    auth.uid(),
    'member_deleted',
    target_user_id,
    jsonb_build_object('member_name', target_profile.full_name, 'member_email', target_profile.email)
  );
  delete from auth.users where id = target_user_id;
  if not found then raise exception 'The selected auth user was not found.'; end if;
end;
$$;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

create or replace function public.bootstrap_super_admin(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_active boolean;
begin
  if auth.uid() is not null then
    raise exception 'Super Admin bootstrap is available only from the database owner context.';
  end if;
  select is_active into target_active from public.profiles where id = target_user_id for update;
  if not found or target_active is distinct from true then
    raise exception 'Choose an existing active profile before bootstrapping Super Admin access.';
  end if;
  if exists (select 1 from public.super_admin_members where user_id = target_user_id) then
    return;
  end if;

  perform set_config('app.admin_bootstrap_role_change', 'true', true);
  update public.profiles set role = 'admin' where id = target_user_id and role <> 'admin';
  insert into public.super_admin_members (user_id, granted_by)
  values (target_user_id, null)
  on conflict (user_id) do nothing;
  insert into public.super_admin_audit_logs (actor_id, action, target_user_id, metadata)
  values (null, 'super_admin_bootstrapped', target_user_id, jsonb_build_object('source', 'database-owner bootstrap'));
end;
$$;
revoke all on function public.bootstrap_super_admin(uuid) from public, anon, authenticated;

-- Keep the existing database-owner recovery operation, but remove it from the
-- authenticated signup/sign-in flow and record any owner-driven recovery grant.
create or replace function public.ensure_admin_exists()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare bootstrap_admin uuid;
begin
  if exists (select 1 from public.profiles where role = 'admin' and is_active = true) then
    return;
  end if;

  select id into bootstrap_admin
  from public.profiles
  where is_active = true
  order by created_at asc, id asc
  limit 1;

  if bootstrap_admin is null then
    select id into bootstrap_admin
    from public.profiles
    order by created_at asc, id asc
    limit 1;
  end if;

  if bootstrap_admin is null then return; end if;

  perform set_config('app.admin_bootstrap_role_change', 'true', true);
  perform set_config('app.admin_bootstrap_access_change', 'true', true);
  update public.profiles
  set role = 'admin', is_active = true, updated_at = timezone('utc', now())
  where id = bootstrap_admin;

  insert into public.super_admin_audit_logs (actor_id, action, target_user_id, metadata)
  values (auth.uid(), 'admin_bootstrap_granted', bootstrap_admin, jsonb_build_object('source', 'database-owner recovery'));
end;
$$;
revoke all on function public.ensure_admin_exists() from public, anon, authenticated;

create or replace function public.ensure_current_user_profile()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  auth_user auth.users%rowtype;
  ensured_profile public.profiles;
begin
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;
  perform pg_advisory_xact_lock(20260421::bigint);
  select * into auth_user from auth.users where id = auth.uid();
  if auth_user.id is null then raise exception 'Authenticated user record not found.'; end if;

  select * into ensured_profile from public.profiles where id = auth.uid();
  if found then
    update public.profiles
    set email = coalesce(auth_user.email, email),
        full_name = coalesce(auth_user.raw_user_meta_data ->> 'full_name', full_name),
        updated_at = timezone('utc', now())
    where id = auth.uid()
    returning * into ensured_profile;
  else
    insert into public.profiles (id, email, full_name, role, is_active)
    values (
      auth.uid(),
      coalesce(auth_user.email, ''),
      coalesce(auth_user.raw_user_meta_data ->> 'full_name', split_part(coalesce(auth_user.email, ''), '@', 1)),
      'user'::public.app_role,
      true
    )
    returning * into ensured_profile;
  end if;
  return to_jsonb(ensured_profile);
end;
$$;
revoke all on function public.ensure_current_user_profile() from public, anon;
grant execute on function public.ensure_current_user_profile() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, role, is_active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    'user'::public.app_role,
    true
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name);
  return new;
end;
$$;

create or replace function public.claim_admin_if_no_active_admin()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;
  return (select to_jsonb(member) from public.profiles member where member.id = auth.uid());
end;
$$;
revoke all on function public.claim_admin_if_no_active_admin() from public, anon, authenticated;
revoke all on function public.backfill_profiles_from_auth() from public, anon, authenticated;
