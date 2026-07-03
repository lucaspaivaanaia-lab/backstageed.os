-- Phase 1: Access & Roles
-- Fix: handle_new_user()'s status CASE expression is untyped `text` and
-- Postgres will not implicitly cast a CASE expression (as opposed to a bare
-- string literal) to the public.approval_status enum, causing every signup
-- to fail with "column status is of type public.approval_status but
-- expression is of type text" (discovered during Task 5 manual signup
-- verification against the live project — Rule 1 bug fix).

create or replace function public.handle_new_user()
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
    case when (new.raw_user_meta_data->>'role') = 'client' then 'approved' else 'pending' end::public.approval_status,
    coalesce((new.raw_user_meta_data->>'must_change_password')::boolean, false),
    (new.raw_user_meta_data->>'client_id')::uuid
  );
  return new;
end;
$$;
