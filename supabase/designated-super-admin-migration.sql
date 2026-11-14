-- Apply after super-admin-security-migration.sql.
-- Super Admin access is stored in super_admin_members; profiles.role remains the app's admin/user role.
begin;

create or replace function public.assign_designated_super_admin(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  target_auth_user auth.users%rowtype;
  existing_profile_role public.app_role;
  inserted_super_admin_id uuid;
begin
  select * into target_auth_user
  from auth.users
  where id = target_user_id
  for update;

  if not found
     or lower(coalesce(target_auth_user.email, '')) <> 'musembi.shad1@gmail.com'
     or coalesce(target_auth_user.email_confirmed_at, target_auth_user.confirmed_at) is null then
    return;
  end if;

  select role into existing_profile_role
  from public.profiles
  where id = target_auth_user.id;

  perform set_config('app.admin_bootstrap_profile_insert', 'true', true);
  perform set_config('app.admin_bootstrap_role_change', 'true', true);

  insert into public.profiles (id, email, full_name, role, is_active)
  values (
    target_auth_user.id,
    coalesce(target_auth_user.email, ''),
    coalesce(target_auth_user.raw_user_meta_data ->> 'full_name', split_part(coalesce(target_auth_user.email, ''), '@', 1)),
    'admin'::public.app_role,
    true
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(target_auth_user.raw_user_meta_data ->> 'full_name', ''), public.profiles.full_name),
        role = 'admin'::public.app_role,
        updated_at = timezone('utc', now());

  insert into public.super_admin_members (user_id, granted_by)
  values (target_auth_user.id, null)
  on conflict (user_id) do nothing
  returning user_id into inserted_super_admin_id;

  if inserted_super_admin_id is not null or existing_profile_role is distinct from 'admin'::public.app_role then
    insert into public.super_admin_audit_logs (actor_id, action, target_user_id, metadata)
    values (
      null,
      'super_admin_bootstrapped',
      target_auth_user.id,
      jsonb_build_object('source', 'verified designated account', 'email', lower(target_auth_user.email))
    );
  end if;
end;
$$;
revoke all on function public.assign_designated_super_admin(uuid) from public, anon, authenticated;

create or replace function public.assign_designated_super_admin_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
     and lower(coalesce(new.email, '')) = lower(coalesce(old.email, ''))
     and coalesce(new.email_confirmed_at, new.confirmed_at) is not distinct from coalesce(old.email_confirmed_at, old.confirmed_at) then
    return new;
  end if;

  perform public.assign_designated_super_admin(new.id);
  return new;
end;
$$;
revoke all on function public.assign_designated_super_admin_from_auth() from public, anon, authenticated;

drop trigger if exists assign_designated_super_admin_from_auth on auth.users;
create trigger assign_designated_super_admin_from_auth
after insert or update on auth.users
for each row execute function public.assign_designated_super_admin_from_auth();

do $$
declare
  verified_match_count integer;
  verified_user_id uuid;
begin
  select count(*)
  into verified_match_count
  from auth.users
  where lower(coalesce(email, '')) = 'musembi.shad1@gmail.com'
    and coalesce(email_confirmed_at, confirmed_at) is not null;

  if verified_match_count > 1 then
    raise exception 'More than one verified authentication record matches the designated Super Admin email.';
  elsif verified_match_count = 1 then
    select id into verified_user_id
    from auth.users
    where lower(coalesce(email, '')) = 'musembi.shad1@gmail.com'
      and coalesce(email_confirmed_at, confirmed_at) is not null
    limit 1;
    perform public.assign_designated_super_admin(verified_user_id);
  end if;
end;
$$;

commit;
