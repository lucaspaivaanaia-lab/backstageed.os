-- Phase 1: Access & Roles
-- profiles table (1:1 with auth.users), role/status enums, handle_new_user()
-- trigger, and the column-immutability BEFORE UPDATE trigger.
--
-- Source: pattern from https://supabase.com/docs/guides/auth/managing-user-data
-- (trigger scaffold), combined with project-specific role/status branching
-- logic and the email mirror + column-immutability trigger (both project-
-- specific additions documented in 01-RESEARCH.md / 01-01-PLAN.md).

-- 'deactivated' is used by a later plan (01-04) for Client-access
-- deactivation, kept distinct from 'rejected' (used only for PM signups
-- an admin declines) so the two flows are never conflated (Warning 3).
create type public.user_role as enum ('admin', 'pm', 'client');
create type public.approval_status as enum ('pending', 'approved', 'rejected', 'deactivated');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role public.user_role not null default 'pm',
  status public.approval_status not null default 'pending',
  must_change_password boolean not null default false,
  client_id uuid,
  created_at timestamptz not null default now()
);

-- CVE-2025-48757 class of bug: RLS is opt-in per table in Postgres. A table
-- with no RLS enabled is fully readable/writable by anyone holding the
-- anon/publishable key. This line MUST live in the same migration as the
-- CREATE TABLE above, never as a follow-up step.
alter table public.profiles enable row level security;

-- handle_new_user(): populates a profiles row the moment a row is inserted
-- into auth.users, whether via self-signup (PM, role defaults 'pm') or
-- admin.createUser() (Client, role='client' passed in metadata).
-- Defensive coalesce()s per Pitfall 5 — malformed metadata must not throw
-- and silently block all signups.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, role, status, must_change_password, client_id)
  values (
    new.id,
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'pm'),
    case when (new.raw_user_meta_data->>'role') = 'client' then 'approved' else 'pending' end,
    coalesce((new.raw_user_meta_data->>'must_change_password')::boolean, false),
    (new.raw_user_meta_data->>'client_id')::uuid
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- prevent_profile_privilege_escalation(): Postgres RLS is row-granular, NOT
-- column-granular — a "user updates own row" RLS policy cannot by itself
-- stop a PM from setting role='admin'/status='approved' on themselves via a
-- direct PostgREST UPDATE. A BEFORE UPDATE trigger is the standard Postgres
-- mechanism for column-level immutability (Blocker 1 / T-01-19).
--
-- NOTE: this function references public.is_admin(), which is defined in
-- 0004_rls_policies.sql. The function body only needs is_admin() to exist
-- at CALL time (i.e. the first UPDATE on profiles after 0004 has run), not
-- at CREATE FUNCTION time, so declaring it here is safe.
create function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if (new.role is distinct from old.role or new.status is distinct from old.status)
     and not public.is_admin() then
    raise exception 'Only an admin can change role or status';
  end if;
  return new;
end;
$$;

create trigger prevent_profile_privilege_escalation_trg
  before update on public.profiles
  for each row execute procedure public.prevent_profile_privilege_escalation();
