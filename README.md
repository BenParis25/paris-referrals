# Paris Referrals

Internal app for Paris Counseling clinicians to keep their openings current and run referral-source outreach.

- **My week**: your openings card, the offices you own, follow-ups due.
- **Find offices**: 551 primary care, pediatric, OB/GYN, internal medicine and therapy offices near Greenwood and Lawrence (CMS NPI Registry, pulled Oct 31, 2026). Claim an office and it's yours to call; teammates see it's taken.
- **Team openings**: everyone's card plus a copy-ready team note.
- **Admin** (Randi, Ben): scoreboard, roster/sign-in emails, referral details, office list import.

No client information (PHI) is ever stored. Practice contact data and clinician openings only.

## Stack
Vite + React + TypeScript on Vercel. Supabase (Postgres + Google sign-in, row-level security).

- Sign-in: Google OAuth (Internal to the pariscounselingllc.org Workspace). Only emails on the roster get any data.
- Access rules: `supabase/migrations/001_init.sql`. Everyone on the roster reads everything; you edit only your own card and your own claimed offices; admins edit all.
- Claims with no update for 30 days are released nightly (`002_stale_claims.sql`, pg_cron).

## Env
```
VITE_SUPABASE_URL=https://dlbcrzlbzquhmrihxnmg.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable key>
```

## Refreshing the office list
`data/practices.json` is the merged NPI pull. Update it, copy to `src/data/practices.json`, deploy, then Admin → Office list → Load.
