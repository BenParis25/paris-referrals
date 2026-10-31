-- Claims with no activity for 30 days go back to the open list (nightly).
create extension if not exists pg_cron;

create or replace function public.release_stale_claims() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with gone as (
    delete from public.claims
    where status in ('Claimed','Called','Letter sent') and updated_at < now() - interval '30 days'
    returning practice_id, clinician_id
  ), logged as (
    insert into public.activity (practice_id, clinician_id, kind, body)
    select practice_id, clinician_id, 'released', 'Released automatically after 30 days with no update' from gone
    returning 1
  )
  select count(*) into n from logged;
  return n;
end $$;
revoke all on function public.release_stale_claims() from public, anon, authenticated;

select cron.schedule('release-stale-claims', '15 7 * * *', $$select public.release_stale_claims()$$);
