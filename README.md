# Pinnacle Donations

A multi-tenant donor system of record for small nonprofit teams. Each
organization gets isolated donors, donations, funds, campaigns, reports,
imports, branding, feature flags, and admin controls. Tenant isolation is
enforced by Supabase/Postgres RLS.

The live production tenant is **Catholic Campus Ministry (CCMC)**.

- **Live:** https://ccmc.pinnacledatascience.com
- **Alias:** https://ccm-demo-alpha.vercel.app
- **Hosting:** Vercel, auto-deploys from `main`
- **Database + Auth:** Supabase project `eqlutbgwsnyhdkaubjbh`

## Stack

- **Next.js 15.5.18** App Router, TypeScript, Server Actions, Route Handlers
- **Supabase** Postgres + Auth via `@supabase/ssr`
- **Tailwind CSS** with per-organization branding
- **Recharts**, `react-simple-maps`, and `topojson-client` for dashboards and analysis
- **Vitest** unit tests and **Playwright** smoke tests
- **Zod** for server-side validation

## Current production state

- Multi-tenant app is live at `https://ccmc.pinnacledatascience.com`.
- GitHub repo is `ryansanders123/donation-portal`.
- Migrations are applied through `0023_pds_report_rpc.sql`.
- Security hardening is live:
  - Platform-wide org management requires `users.platform_admin = true`.
  - Tenant admins can manage only their active organization.
  - `users_with_providers` is no longer queried by the app and authenticated grants were revoked.
  - `/api/whoami` is admin gated.
  - CSV exports neutralize spreadsheet formula injection.
  - The app no longer uses raw `DATABASE_URL` or `pg` at runtime.
- PDS reporting data still lives in the same Supabase database under schema `pds`.
  Because the `pds` schema is not exposed through PostgREST, report pages read
  it through public RPC wrappers:
  - `public.pds_ar_vr_vh_rows()`
  - `public.pds_accudata_ubi_rows()`
- Latest verified checks:
  - `npx.cmd tsc --noEmit`
  - `npm.cmd run lint`
  - `npm.cmd test`
  - `npm.cmd run build`
  - `npm.cmd audit --omit=dev`

## Live data snapshot

As of 2026-05-12:

| Table | Rows |
|---|---:|
| `public.organizations` | 2 |
| `public.users` | 3 |
| `public.user_organizations` | 6 |
| `public.donees` | 1,885 |
| `public.donations` | 12,341 |
| `public.import_batches` | 2 |
| `public.import_field_mappings` | 0 |
| `pds.ar_vr_vh_summary` | 16,861 |
| `pds.accudata_ubi` | 14,800 |

Current org slugs: `ccmc`, `wrh`.

## Auth and roles

Sign-in methods are Google OAuth, Microsoft/Entra OAuth, and email magic link,
all through Supabase Auth. The source of truth is `public.users`, linked to
`auth.users` through `auth_user_id`.

First sign-in flows through `/auth/callback` and `runCallbackGate()`. The
callback matches the OAuth email to an invited `public.users` row, links
`auth_user_id`, and rejects non-invited users.

Role model:

| Role | Where | Scope |
|---|---|---|
| Platform admin | `users.platform_admin = true` | Can manage all organizations and platform-level records. |
| Tenant admin | `user_organizations.role = 'admin'` | Can manage users, funds, imports, branding, and reports for the active organization. |
| Tenant member | `user_organizations.role = 'member'` | Can use donation and reporting workflows allowed by org feature flags. |

`users.organization_id` stores the active organization. `user_organizations`
stores every organization membership.

See `docs/sso-setup.md` for external OAuth setup.

## Tenant model

| Table or area | Scope | Notes |
|---|---|---|
| `organizations` | Platform | Tenant records, branding, feature flags, and status. |
| `users` | Platform identity + active org | Email identity, linked Supabase auth user, active org, platform admin flag. |
| `user_organizations` | Org membership | Many-to-many membership with tenant role. |
| `donees`, `funds`, `donations`, `campaigns`, `appeals` | Organization | RLS uses `organization_id = current_org_id()`. |
| `import_batches`, `import_field_mappings` | Organization | CSV import tracking and mapping history. |
| `donee_external_refs`, `donee_merges`, `donee_dup_rejections` | Organization | Dedup and merge audit trail. |
| `pds.*` | Reporting schema | Same database, read by public RPC wrappers. |

## Project layout

```text
app/
  (app)/
    page.tsx
    admin/
      organizations/
      users/
      funds/
      campaigns/
      appeals/
    donations/
      add/
      import/
      dedupe/
      [id]/void/
    donors/
    report/
    reports/
      ar-vr-vh/
      accudata-ubi/
    tax-summary/
  (public)/
  api/
    exports/
    whoami/
  auth/
components/
lib/
  auth.ts
  auth-callback.ts
  csv.ts
  dashboard.ts
  dedup*.ts
  org*.ts
  pds-db.ts
  reports.ts
  supabase/
supabase/migrations/
scripts/
tests/
docs/
```

## Migrations

The migration runner tracks applied files in `public.schema_migrations`.
Historical duplicate prefixes are intentional and must be treated as distinct
filenames.

| File | Purpose |
|---|---|
| `0001_extensions.sql` | `pgcrypto`, `citext` |
| `0002_tables.sql` | Core donation tables |
| `0003_indexes.sql` | Search and report indexes |
| `0004_functions.sql` | Initial auth helpers |
| `0005_rls.sql` | Initial RLS policies |
| `0006_fix_rls_composite_null.sql` | Fix composite-row RLS checks with `is_app_user()` |
| `0006_triggers.sql` | Donation immutability and last-admin guard |
| `0007_seed.sql` | Initial seed rows |
| `0008_campaigns_appeals.sql` | Campaign and appeal tables |
| `0009_donee_address_split.sql` | Structured donee address fields |
| `0010_donor_list_view.sql` | Donor aggregate view |
| `0011_multi_tenant_foundation.sql` | Organizations and org-scoped RLS |
| `0012_csv_import.sql` | Import batch and mapping foundation |
| `0013_csv_import_hardening.sql` | Import constraints and validation hardening |
| `0014_branding_and_features.sql` | Org branding and feature flags |
| `0014_user_organizations.sql` | Multi-org user memberships |
| `0015_wrh_org_and_schema.sql` | WRH org and reporting schema foundation |
| `0016_wrh_rls.sql` | WRH RLS support |
| `0017_pds_schema_and_tables.sql` | PDS reporting tables |
| `0018_pds_rls.sql` | PDS reporting RLS |
| `0019_donor_dedup.sql` | Dedup tables and audit trail |
| `0020_donor_dedup_functions.sql` | Dedup helper functions |
| `0021_branding_extras.sql` | Additional branding fields |
| `0022_security_hardening.sql` | Platform admin, admin gates, trigger hardening |
| `0023_pds_report_rpc.sql` | Public RPC wrappers for PDS report reads |

## Running locally

```bash
cp .env.local.example .env.local
npm install
npm run dev
npm test
npm run test:e2e
```

Runtime app access uses Supabase URL and keys. Do not add raw `DATABASE_URL`
usage back into app code.

Apply migrations to the hosted database through the Supabase pooler:

```bash
export SUPABASE_DB_URL="postgresql://postgres.eqlutbgwsnyhdkaubjbh:<password>@aws-1-us-east-2.pooler.supabase.com:5432/postgres"
node scripts/apply-migrations.mjs
```

Use `BASELINE_EXISTING=1` only when attaching migration tracking to an existing
database that already has the schema but no `public.schema_migrations` history.

## Operational gotchas

- The direct Supabase DB host is IPv6-only in this environment. Use the
  session-mode pooler for migrations and audits.
- Do not query `.schema("pds")` from Supabase JS. The `pds` schema is not
  exposed through PostgREST. Use the public RPC wrappers in `lib/pds-db.ts`.
- Do not restore app reads from `users_with_providers`; the authenticated grant
  is intentionally revoked.
- Platform admin and tenant admin are separate. Do not use tenant admin checks
  for platform-wide organization pages.
- Production Vercel env vars are configured. Preview/development env setup via
  CLI has not been fully normalized, so configure those in the Vercel dashboard
  if preview deployments need the same environment.

## Seeded platform admin

- `rpsanders01@gmail.com`
