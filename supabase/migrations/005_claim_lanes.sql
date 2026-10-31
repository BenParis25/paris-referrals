-- Two lanes per office: prescriber (rx) and therapy. A claim blocks only its own lane.
alter table public.claims add column lane text not null default 'therapy' check (lane in ('rx','therapy'));
update public.claims c set lane = case when k.is_prescriber then 'rx' else 'therapy' end from public.clinicians k where k.id = c.clinician_id;
alter table public.claims drop constraint claims_pkey;
alter table public.claims add primary key (practice_id, lane);

create or replace function public.set_claim_lane() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.lane := case when (select is_prescriber from public.clinicians where id = new.clinician_id) then 'rx' else 'therapy' end;
  return new;
end $$;
revoke execute on function public.set_claim_lane() from public, anon, authenticated;
create trigger claims_lane before insert or update of clinician_id on public.claims
  for each row execute function public.set_claim_lane();

create or replace function public.taken_offices() returns setof text
language sql stable security definer set search_path = public as $$
  select c.practice_id from public.claims c
  where public.me() is not null
    and c.lane = (select case when is_prescriber then 'rx' else 'therapy' end from public.clinicians where id = public.me())
$$;
revoke all on function public.taken_offices() from public, anon;
grant execute on function public.taken_offices() to authenticated;
