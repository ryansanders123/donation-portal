# Pinnacle Donations Done Criteria

Current production URL: https://ccmc.pinnacledatascience.com

This checklist started as the Task 5.3 acceptance list from
`docs/superpowers/plans/2026-04-16-donation-mgmt.md`. It now also tracks the
production multi-tenant, import, dedup, analysis, and hardening work.

## Original donation criteria

- [x] Login shows Google, Microsoft, and magic-link sign-in.
- [x] First sign-in links an invited `public.users` row through Supabase Auth.
- [x] Same email across providers links to one app user.
- [x] Invited tenant member gets non-admin permissions.
- [x] Uninvited email is rejected.
- [x] Donation entry supports existing and inline-created donees.
- [x] Check, online, and cash field requirements are server validated.
- [x] Monthly report totals and CSV export are implemented.
- [x] Void flow and include-voided reporting behavior are implemented.
- [x] Tax summary CSV and print view are implemented.
- [x] Autocomplete performance test exists for 10k donees.
- [x] Archived funds are excluded from new donations while preserved on old rows.

## Current production criteria

- [x] Supabase Auth Site URL is set to `https://ccmc.pinnacledatascience.com`.
- [x] Production Vercel environment variables are configured.
- [x] Vercel deploys from `main`.
- [x] Migrations are applied through `0023_pds_report_rpc.sql`.
- [x] Multi-tenant organization model is live.
- [x] Org membership model is live through `public.user_organizations`.
- [x] Platform admin is separate from tenant admin.
- [x] Platform organization admin pages require platform admin.
- [x] Tenant admins are scoped to active organization.
- [x] CSV import workflow is implemented.
- [x] Donor dedup workflow is implemented.
- [x] Branding and feature flags are implemented.
- [x] PDS analysis reports read through public RPC wrappers.
- [x] `users_with_providers` authenticated grant is revoked.
- [x] CSV formula injection is neutralized.
- [x] Runtime app code does not use raw `DATABASE_URL` or `pg`.
- [x] `npm audit --omit=dev` reports 0 vulnerabilities.

## Latest verification

Most recent full check passed:

- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd test`
- `npm.cmd run build`
- `npm.cmd audit --omit=dev`
- `/login` production smoke
- `/reports/ar-vr-vh` production smoke

## Still manual / operational

- [ ] Configure preview/development Vercel env vars in the dashboard if preview deployments are needed.
- [ ] Decide whether to tighten branch protection and avoid direct pushes to `main`.
- [ ] Decide whether to rename stale local/Vercel metadata that still says `ccm-demo`.
