---
title: 'Supabase pg_cron: manage jobs as migrations with a per-env config table (stg/prod mirror)'
problem_type: integration
platforms:
  - backend
  - supabase
symptoms:
  - pg_cron job created by hand on staging only; promoting to prod is a manual, error-prone SQL step
  - Cron command embeds an env-specific function URL + anon key, so it can't be one committed migration
  - "ALTER DATABASE postgres SET app.settings.x = ... fails: permission denied to set parameter on managed Supabase"
  - Want staging scheduled but SILENT (no test FCM sends / device pings) while prod is live, from the same migration
  - Need to read/toggle the cron from an admin UI, but the config lives in a schema not exposed to PostgREST
tags:
  - supabase
  - pg_cron
  - pg_net
  - migrations
  - edge-functions
  - environments
  - security-definer
  - infra-as-code
severity: medium
---

## Context

A per-minute `pg_cron` → `pg_net.http_post` → edge-function pipeline (e.g. a reminder sender). Functions and DB migrations already mirror stg↔prod via deploy scripts, but the **cron job** was created with hand-run SQL on staging only — the one piece not in version control, and a manual step when promoting to prod.

## Root Cause

The cron command must embed two **env-specific** values — the function URL (project ref differs) and an auth key — so a single hardcoded migration can't serve both environments. The obvious fix (per-env Postgres settings via `ALTER DATABASE ... SET`) **fails on managed Supabase**: `ERROR: 42501: permission denied to set parameter`. And the natural place to keep the values (a `private` schema) isn't reachable from the REST client, so an admin UI can't read/toggle it directly.

## The Fix

Manage the cron as a migration; put the per-env values in a small **config table**, and gate sends with a **flag**.

### 1. Migration: extensions + private config table + the cron (secret-free, identical across envs)

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

create schema if not exists private;
create table if not exists private.cron_config (key text primary key, value text not null);
revoke all on private.cron_config from anon, authenticated;   -- keep out of PostgREST

-- cron.schedule upserts by name → idempotent, and replaces any earlier hand-made job.
-- The command reads URL + auth from the table AT RUN TIME (so key rotation is a table update),
-- and a flag lets a non-prod env stay scheduled but silent.
select cron.schedule('send-reminders-every-minute', '* * * * *', $cmd$
  select net.http_post(
    url := (select value from private.cron_config where key = 'edge_base_url') || '/send-reminders',
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer ' || (select value from private.cron_config where key = 'cron_anon_key')),
    body := '{}'::jsonb)
  -- target expr isn't evaluated when WHERE is false → no HTTP call at all when disabled
  where coalesce((select value from private.cron_config where key = 'automated_sends_enabled'), 'true') = 'true';
$cmd$);
```

### 2. Seed the per-env values ONCE (not committed — this is the only per-env step)

```sql
insert into private.cron_config(key, value) values
  ('edge_base_url', 'https://<project-ref>.supabase.co/functions/v1'),
  ('cron_anon_key', '<that env''s anon key>'),
  ('automated_sends_enabled', 'true')   -- set 'false' on staging to keep it silent
on conflict (key) do update set value = excluded.value;
```

### 3. Admin read/toggle via SECURITY DEFINER RPCs (PostgREST can't reach `private`)

Expose thin functions in the API schema, locked to `service_role`, that bridge to the private table:

```sql
create or replace function api.reminder_cron_set(p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  insert into private.cron_config(key, value)
  values ('automated_sends_enabled', case when p_enabled then 'true' else 'false' end)
  on conflict (key) do update set value = excluded.value;
  return api.reminder_cron_status();  -- companion reader
end; $$;
revoke all on function api.reminder_cron_set(boolean) from public;
grant execute on function api.reminder_cron_set(boolean) to service_role;
```

An admin edge function (service role) calls `supabase.rpc('reminder_cron_set', { p_enabled })`; a dashboard/console can then toggle the cron with no hand-run SQL.

## Why This Works

- **Mirror by default**: the migration is byte-identical across envs; only the `cron_config` rows differ. Promoting to prod = apply migrations + seed 3 rows.
- **No secrets in git**: the URL/key live in the table, seeded per env.
- **Runtime read** means rotating the anon key or moving the edge URL is a one-row `update`, not a reschedule.
- **`where coalesce(... 'automated_sends_enabled') = 'true'`** keeps staging scheduled (still visible in `cron.job_run_details`) but makes **zero** HTTP calls when off — no wasted FCM sends, no test-device pings. Defaults ON when the row is absent, so prod is safe by default.
- **SECURITY DEFINER + service_role grant** is the only bridge from an API-schema function to a `private`-schema table without exposing `private` to PostgREST.

## Prevention

- **Treat cron jobs as code.** A job created by hand in one environment is a hidden snowflake. Put `cron.schedule(...)` in a migration (it upserts by name, so it's idempotent) and let every env get it by applying migrations.
- **Don't reach for `ALTER DATABASE ... SET` on managed Postgres** for per-env config — it's permission-blocked. A tiny `private` config table is the portable substitute.
- **Gate automated sends behind an env flag** so non-prod stays quiet by construction, not by remembering to disable it. Future automated jobs (win-backs, cleanups) check the same flag.
