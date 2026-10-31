-- Each therapist sees only their own card, claims and history. Admins see everything.
drop policy if exists clin_read on public.clinicians;
create policy clin_read on public.clinicians for select to authenticated
  using (id = public.me() or public.is_admin());

drop policy if exists claim_read on public.claims;
create policy claim_read on public.claims for select to authenticated
  using (clinician_id = public.me() or public.is_admin());

drop policy if exists act_read on public.activity;
create policy act_read on public.activity for select to authenticated
  using (clinician_id = public.me() or public.is_admin());

-- Therapists still need to know an office is taken (not by whom) so nobody double-calls.
create or replace function public.taken_offices() returns setof text
language sql stable security definer set search_path = public as $$
  select practice_id from public.claims where public.me() is not null
$$;
revoke all on function public.taken_offices() from public, anon;
grant execute on function public.taken_offices() to authenticated;
