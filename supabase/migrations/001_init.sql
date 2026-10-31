-- Paris Counseling referral app
-- Practice-level contact data and clinician openings only. No client information (PHI) is ever stored here.

create extension if not exists pgcrypto;

-- ---------- tables ----------
create table public.clinicians (
  id uuid primary key default gen_random_uuid(),
  email text,                              -- Google sign-in email; null = card exists but nobody can sign in as them yet
  name text not null,
  creds text not null default '',
  role text not null default '',
  is_prescriber boolean not null default false,
  is_admin boolean not null default false,
  clinical boolean not null default true,  -- false = staff/admin login with no openings card
  active boolean not null default true,
  status text not null default 'open' check (status in ('open','limited','full')),
  openings text not null default '',
  where_text text not null default '',
  ages text not null default '',
  insurance text[] not null default '{}',
  fits text[] not null default '{}',
  limits text[] not null default '{}',
  phone_ext text not null default '',
  target_segments text[] not null default '{Primary care,Internal medicine,Pediatrics,OB/GYN}',
  profile_url text not null default '',
  sort int not null default 100,
  updated_at timestamptz not null default now()
);
create unique index clinicians_email_lower on public.clinicians (lower(email));

create table public.practices (
  id text primary key,                     -- first NPI
  practice text not null,
  address text not null default '',
  city text not null default '',
  zip text not null default '',
  phone text not null default '',
  fax text not null default '',
  segment text not null,
  system text not null default 'Independent',
  clinicians text[] not null default '{}',
  clinician_count int not null default 0,
  npis text[] not null default '{}',
  taxonomy text not null default '',
  area text not null check (area in ('Greenwood','Lawrence')),
  priority text not null check (priority in ('A','B','C')),
  hidden boolean not null default false     -- admin can hide bad rows
);

-- One claim per office: whoever claims it owns the outreach, so nobody calls the same office twice.
create table public.claims (
  practice_id text primary key references public.practices(id) on delete cascade,
  clinician_id uuid not null references public.clinicians(id) on delete cascade,
  status text not null default 'Claimed' check (status in ('Claimed','Called','Letter sent','Meeting set','Referring','Not a fit')),
  contact_name text not null default '',
  contact_email text not null default '',
  contact_fax text not null default '',
  next_date date,
  notes text not null default '',
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index claims_clinician on public.claims (clinician_id);

create table public.activity (
  id bigint generated always as identity primary key,
  practice_id text not null references public.practices(id) on delete cascade,
  clinician_id uuid references public.clinicians(id) on delete set null,
  kind text not null default 'note',
  body text not null default '',
  at timestamptz not null default now()
);
create index activity_practice on public.activity (practice_id, at desc);
create index activity_clinician on public.activity (clinician_id, at desc);

create table public.settings (
  id int primary key default 1 check (id = 1),
  phone text not null default '317-308-4007',
  fax text not null default '',
  email text not null default 'ContactUs@pariscounselingllc.org',
  request_url text not null default 'pariscounseling.clientsecure.me',
  greenwood text not null default '3209 W. Smith Valley Rd, Suite 216, Greenwood, IN 46142',
  lawrence text not null default '9165 Otis Ave, Suite 156, Indianapolis, IN 46216'
);
insert into public.settings (id) values (1);

-- ---------- helpers ----------
create or replace function public.me() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.clinicians
  where active and email is not null and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.clinicians
    where active and email is not null and lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) limit 1), false)
$$;

revoke all on function public.me() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.me() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- Non-admins may edit their own card but never their email, admin flag, active flag, prescriber flag or sort order.
create or replace function public.guard_clinician_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- only applies to signed-in app users; maintenance from the dashboard / service role is unrestricted
  if coalesce(auth.jwt() ->> 'role', '') = 'authenticated' and not public.is_admin() then
    if new.email is distinct from old.email or new.is_admin is distinct from old.is_admin
       or new.active is distinct from old.active or new.is_prescriber is distinct from old.is_prescriber
       or new.clinical is distinct from old.clinical or new.sort is distinct from old.sort then
      raise exception 'Only an admin can change sign-in, admin, active, prescriber or order fields';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger clinicians_guard before update on public.clinicians
  for each row execute function public.guard_clinician_update();

-- Claims: owner can't be moved by a non-admin; stamp updated_at.
create or replace function public.guard_claim_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'authenticated' and not public.is_admin()
     and new.clinician_id is distinct from old.clinician_id then
    raise exception 'Only an admin can reassign an office';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger claims_guard before update on public.claims
  for each row execute function public.guard_claim_update();

-- ---------- row level security ----------
alter table public.clinicians enable row level security;
alter table public.practices  enable row level security;
alter table public.claims     enable row level security;
alter table public.activity   enable row level security;
alter table public.settings   enable row level security;

-- Nothing for signed-out visitors.
revoke all on all tables in schema public from anon;

-- clinicians
create policy clin_read on public.clinicians for select to authenticated using (public.me() is not null);
create policy clin_update_own on public.clinicians for update to authenticated
  using (id = public.me() or public.is_admin()) with check (id = public.me() or public.is_admin());
create policy clin_admin_insert on public.clinicians for insert to authenticated with check (public.is_admin());
create policy clin_admin_delete on public.clinicians for delete to authenticated using (public.is_admin());

-- practices
create policy prac_read on public.practices for select to authenticated using (public.me() is not null);
create policy prac_admin_write on public.practices for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- claims: everyone on the team sees who owns which office; you only change your own.
create policy claim_read on public.claims for select to authenticated using (public.me() is not null);
create policy claim_insert_self on public.claims for insert to authenticated
  with check (clinician_id = public.me() or public.is_admin());
create policy claim_update_own on public.claims for update to authenticated
  using (clinician_id = public.me() or public.is_admin()) with check (public.me() is not null);
create policy claim_delete_own on public.claims for delete to authenticated
  using (clinician_id = public.me() or public.is_admin());

-- activity: append-only log; you write entries as yourself on offices you own.
create policy act_read on public.activity for select to authenticated using (public.me() is not null);
create policy act_insert on public.activity for insert to authenticated with check (
  clinician_id = public.me() and (
    public.is_admin() or exists (select 1 from public.claims c where c.practice_id = activity.practice_id and c.clinician_id = public.me())
    or kind in ('claimed','released')
  ));
create policy act_admin_delete on public.activity for delete to authenticated using (public.is_admin());

-- settings
create policy set_read on public.settings for select to authenticated using (public.me() is not null);
create policy set_admin on public.settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.clinicians, public.practices, public.claims, public.activity, public.settings to authenticated;
grant usage on sequence public.activity_id_seq to authenticated;

-- live updates for the shared tracker
alter publication supabase_realtime add table public.claims, public.clinicians;
