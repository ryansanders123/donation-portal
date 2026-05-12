# Pinnacle Donations

A multi-tenant donation management portal. Each organization sees its own
donors, donations, funds, campaigns, and reports — fully isolated by RLS at
the database level. Users record cash / check / online gifts, see monthly
and annual totals, and generate donor tax statements.

The first organization on the platform is **Catholic Campus Ministry (CCMC)**.

**Live:** https://ccmc.pinnacledatascience.com
**Hosting:** Vercel (auto-deploys on push to `main`)
**Database + Auth:** Supabase (project ref `eqlutbgwsnyhdkaubjbh`)

## Stack

- **Next.js 14** App Router (TypeScript, Server Actions, Route Handlers)
- **Supabase** — Postgres + Auth (`@supabase/ssr`)
- **Tailwind** with a custom brand palette
- **Recharts** for the home dashboard chart
- **Vitest** for unit tests, **Playwright** for smoke e2e
- **Zod** for input validation

## Auth model

Three sign-in methods: Google OAuth, Microsoft (Entra) OAuth, and email magic
link — all via Supabase Auth. Email-identity model: the `public.users` table
is the source of truth, linked to `auth.users` by `auth_user_id`. First
sign-in flows through `/auth/callback` → `runCallbackGate()` which matches
the OAuth email to an invited row and links it. Non-invited users are
rejected.

See [`docs/sso-setup.md`](docs/sso-setup.md) for the one-time external setup
required to enable Microsoft sign-in.

RLS is enforced on every table. Policies use `public.is_app_user()` and
`public.is_admin()` for role gating, plus `organization_id = public.current_org_id()`
for tenant isolation. Admin-only mutations additionally require `is_admin()`.

## Multi-tenant model

| Table | Org-scoped? | Notes |
|---|---|---|
| `organizations` | n/a | The tenant table itself. |
| `users` | yes | A user belongs to exactly one organization. |
| `donees`, `funds`, `donations`, `campaigns`, `appeals` | yes | All have `organization_id` FK with `current_org_id()` default. |

`current_org_id()` resolves the calling user's `organization_id` from
`public.users`. Column defaults auto-populate `organization_id` on inserts,
so application code doesn't need to set it explicitly (the admin invite
path is the one exception — it sets it explicitly for clarity).

## Project layout

```
app/
  (app)/                  # authed area — layout gates on currentAppUser()
    page.tsx              # home: quick actions + giving-over-time chart
    donations/
      add/                # add donation form (server action)
      [id]/void/          # hardened void flow — admin only
    report/               # monthly report + CSV export
    tax-summary/          # annual donor statements + print view
    admin/
      funds/              # manage funds (admin)
      users/              # invite + manage users (admin)
      campaigns/          # manage campaigns (admin)
      appeals/            # manage appeals (admin)
  (public)/               # login + errors
  auth/callback/          # OAuth code exchange + gate
  auth/signout/
  api/whoami/             # diagnostic endpoint (auth + RLS state)
components/
  DonationsChart.tsx      # Recharts line chart (total / by-fund)
  DoneePicker.tsx         # server-action-driven autocomplete
lib/
  auth.ts                 # currentAppUser, requireUser, requireAdmin
  auth-callback.ts        # email-link gate for OAuth first sign-in
  dashboard.ts            # getMonthlyTotals() — 36-month aggregation
  reports.ts              # summarize() helpers
  validators.ts           # Zod schemas (donation, donee, void, invite, fund)
  supabase/server.ts      # request-scoped server client
  supabase/service.ts     # service-role client (server-only)
supabase/migrations/      # 0001..0011 — see below
scripts/
  apply-migrations.mjs    # runs all migrations against pooler
  import-transactions.mjs # bulk-import CSV donations
  seed-donees.mjs         # perf-test donees (+ --cleanup)
  verify-migrations.mjs
tests/
  lib/                    # vitest unit tests (auth, csv, reports, validators)
  e2e/                    # playwright smoke
  perf/                   # autocomplete p95 benchmark
docs/
  superpowers/
    specs/                # design specs by date
    plans/                # implementation plans by date
  STATUS.md               # what's built vs. plan
  sso-setup.md            # external auth provider setup
  ops/done-criteria.md    # acceptance checklist
```

## Migrations

| # | File | Purpose |
|---|------|---------|
| 0001 | `extensions.sql` | `pgcrypto`, `citext` |
| 0002 | `tables.sql` | `users`, `donees`, `funds`, `donations` |
| 0003 | `indexes.sql` | Query + search indexes |
| 0004 | `functions.sql` | `current_app_user()`, `is_admin()`, `users_with_providers` view |
| 0005 | `rls.sql` | Row-level security policies |
| 0006 | `fix_rls_composite_null.sql` | Bugfix — replaces broken composite checks with `is_app_user()` |
| 0006 | `triggers.sql` | Donation immutable fields + last-admin guard |
| 0007 | `seed.sql` | Default `Anon` donee + `General` fund |
| 0008 | `campaigns_appeals.sql` | `campaigns`, `appeals` tables + RLS |
| 0009 | `donee_address_split.sql` | Structured address columns on donees |
| 0010 | `donor_list_view.sql` | `donor_list_v` aggregating lifetime + last-gift |
| 0011 | `multi_tenant_foundation.sql` | `organizations` + `organization_id` FK + per-org RLS |

## Running locally

```bash
cp .env.local.example .env.local       # fill in Supabase URL + keys
npm install
npm run dev                            # http://localhost:3000
npm test                               # vitest
npm run test:e2e                       # playwright
```

Apply migrations to the hosted DB (pooler, IPv4 — direct host is IPv6-only):

```bash
export SUPABASE_DB_URL="postgresql://postgres.eqlutbgwsnyhdkaubjbh:<password>@aws-1-us-east-2.pooler.supabase.com:5432/postgres"
node scripts/apply-migrations.mjs
```

## Known issues / gotchas

- **Composite-NULL RLS.** Postgres defines `composite IS NOT NULL` as TRUE
  only when *every* field is non-null. `current_app_user()` returns a
  `public.users` row, and most rows have NULL fields, so the original
  policies silently filtered every SELECT. Migration 0006 introduces
  `is_app_user()` which uses `EXISTS` instead — use this helper in any
  future policies.
- **Pooler vs direct host.** The direct Postgres host
  (`db.<ref>.supabase.co`) has no IPv4 record. Use the session-mode pooler
  at `aws-1-us-east-2.pooler.supabase.com:5432`.
- **OAuth + Supabase Site URL.** Site URL must be
  `https://ccmc.pinnacledatascience.com` and redirect allow-list must
  include `https://ccmc.pinnacledatascience.com/**`. Otherwise sign-in
  redirects bounce to `localhost:3000`.

## Seeded admin

- `rpsanders01@gmail.com` — role `admin`, organization CCMC

## Imported data

12,023 historical CCMC transactions (2001–2026), 1,756 donees, 7 funds.
