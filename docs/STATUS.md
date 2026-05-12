# Build Status

Last updated: 2026-05-12

- Live production: https://ccmc.pinnacledatascience.com
- Vercel alias: https://ccm-demo-alpha.vercel.app
- GitHub repo: `ryansanders123/donation-portal`
- Database/Auth: Supabase project `eqlutbgwsnyhdkaubjbh`

## Current state

- Production is live on `main` with Vercel auto-deploy.
- Multi-tenant foundation is live with orgs `ccmc` and `wrh`.
- Org switcher, platform org admin, tenant users, funds, campaigns, appeals,
  branding, and feature flags are implemented.
- CSV import is implemented with import batches and field mappings.
- Donor dedup is implemented with merge/rejection audit tables.
- Monthly reports, donor tax summaries, CSV exports, and PDS analysis report
  pages are implemented.
- Security hardening is live:
  - `users.platform_admin` separates platform admin from tenant admin.
  - `/admin/organizations` is platform-admin only.
  - Tenant admins can manage only their active org.
  - `/api/whoami` is admin gated.
  - Export route handlers require admin or feature-gated access.
  - CSV formula injection is neutralized.
  - `users_with_providers` is no longer queried and its authenticated grant is revoked.
  - Runtime app code does not use raw `DATABASE_URL` or `pg`.
- PDS report pages read same-database `pds` schema data through public RPC
  wrappers because `pds` is not exposed through PostgREST.

## Latest production fixes

- `095b1ae Harden multi-tenant app security`
- `dc5a5ac Fix PDS report data access`

## Database state

Applied migrations: `0001_extensions.sql` through `0023_pds_report_rpc.sql`.

Important live objects:

- `public.users.platform_admin`
- `public.user_organizations`
- `public.donee_external_refs`
- `public.donee_merges`
- `public.donee_dup_rejections`
- `public.pds_ar_vr_vh_rows()`
- `public.pds_accudata_ubi_rows()`

Current row counts as of 2026-05-12:

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

## Verified checks

Most recent full verification passed:

- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd test`
- `npm.cmd run build`
- `npm.cmd audit --omit=dev`
- Production smoke: `/login`
- Production smoke: `/reports/ar-vr-vh`

## Open operational notes

- Production env vars are configured in Vercel. Preview/development env vars
  still need dashboard setup or a cleaned-up CLI workflow if previews are used.
- `.vercel/project.json` still has historical `projectName: "ccm-demo"` even
  though the Vercel CLI project resolves as `donation-portal`.
- Historical migration duplicate prefixes remain:
  - `0006_fix_rls_composite_null.sql` and `0006_triggers.sql`
  - `0014_branding_and_features.sql` and `0014_user_organizations.sql`
- Use `BASELINE_EXISTING=1` only for an existing database with schema already
  present and no `public.schema_migrations` history.
- Branch protection/direct-to-main workflow should be tightened if the repo
  needs a stricter release process.

## Older plan references

- Original plan: `docs/superpowers/plans/2026-04-16-donation-mgmt.md`
- Original spec: `docs/superpowers/specs/2026-04-16-donation-mgmt-design.md`
