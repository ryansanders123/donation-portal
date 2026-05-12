# Build Status

Last updated: 2026-05-05 (post demo→prod cutover + multi-tenant foundation)

Plan: [`docs/superpowers/plans/2026-04-16-donation-mgmt.md`](superpowers/plans/2026-04-16-donation-mgmt.md)
Spec: [`docs/superpowers/specs/2026-04-16-donation-mgmt-design.md`](superpowers/specs/2026-04-16-donation-mgmt-design.md)

## Done (all plan tasks)

### Phase 0 — cleanup
- 0.1 Delete placeholder files

### Phase 1 — Foundation
- 1.1 Scaffold Next.js 14 app
- 1.2 Add `.env.local.example`
- 1.3 Init Supabase project locally + migrations folder
- 1.4 Migration 0001 — extensions
- 1.5 Migration 0002 — tables
- 1.6 Migration 0003 — indexes
- 1.7 Migration 0004 — helper functions + view
- 1.8 Migration 0005 — RLS policies
- 1.9 Migration 0009 — triggers (void-only updates, last-admin safety)
- 1.10 Migration — seed data
- 1.11 Supabase client helpers (server, service, browser)
- 1.12 `currentAppUser()` / `requireUser` / `requireAdmin`
- 1.13 Vitest config + test script
- 1.14 Login page
- 1.15 Auth callback + gate
- 1.16 Signout route
- 1.17 App layout (auth gate + nav)
- 1.18 Supabase Auth provider config (documented)
- 1.19 End-of-Phase-1 smoke check

### Phase 2 — Donation flows
- 2.1 Zod validators
- 2.2 DoneePicker server action (search + create)
- 2.3 DoneePicker client component
- 2.4 Add Donation page
- 2.5 Void donation page
- 2.6 Phase 2 smoke test

### Phase 3 — Reports
- 3.1 Monthly report page + totals (by type, by fund)
- 3.2 CSV export route handler
- 3.3 Tax summary page (print view + CSV)

### Phase 4 — Admin
- 4.1 Admin users list + invite/remove
- 4.2 Admin funds list + archive/restore

### Phase 5 — Tests + cutover
- 5.1 Playwright scaffold + smoke tests
- 5.2 Autocomplete perf test
- 5.3 Done-criteria manual checklist
- 5.4 Production cutover — steps 1–3 done; steps 4–5 require user action

## Extras (not in plan)

- Home page redesign (hero + quick actions + admin section)
- Modern design pass (brand palette, next/font, Fraunces display, card system)
- `components/DonationsChart.tsx` — Recharts line chart on home (total + by-fund toggle)
- `lib/dashboard.ts` — `getMonthlyTotals()` aggregator with paginated Supabase reads
- `app/api/whoami/route.ts` — diagnostic endpoint for auth / RLS state
- Migration 0006 — `is_app_user()` helper + policy rewrite (composite-NULL fix)
- Hardened void flow:
  - admin-only access on the route + server action
  - 20-character minimum reason
  - `confirm: "VOID"` required by Zod
  - client `VoidForm` disables submit until both conditions are met
  - report hides the "Void" link from non-admins
- `scripts/import-transactions.mjs` — bulk CSV importer with donee dedup and fund creation
  - Admin `rpsanders01@gmail.com` seeded
  - 12,023 historical donations (2001–2026), 1,756 donees, 7 funds imported
- `components/TaxDoneePicker.tsx` — small client wrapper that persists the
  selected donee to a hidden form field

## Cutover (2026-05-05)

Project renamed from `ccm-demo` to `donation-portal` (display name "Pinnacle Donations"). Multi-tenant foundation landed — `organizations` table with CCMC as first row; every domain table now has `organization_id` with RLS scoping. Per-org branding, feature flags, and onboarding flow remain deferred.

## Open / next actions

- **Supabase Auth URL Configuration**: Site URL =
  `https://ccmc.pinnacledatascience.com`, Redirect allow-list includes
  `https://ccmc.pinnacledatascience.com/**`.
- Apply migration 0011 to the hosted pooler.
- Rename GitHub repo + Vercel project + Supabase project to match new identifiers.
- Enable GitHub branch protection on `main`.

## Architectural notes worth remembering

- **Composite `IS NOT NULL` gotcha.** Never write
  `current_app_user() IS NOT NULL` in a policy — it evaluates FALSE whenever
  any field of the composite row is NULL. Use `is_app_user()` (EXISTS-based)
  instead.
- **Pooler connection string** required for this environment; the direct
  `db.<ref>.supabase.co` host is IPv6-only.
- **OAuth gate**: `/auth/callback` runs `runCallbackGate()` which matches
  `auth.users.email` → `public.users.email`, links `auth_user_id`, and
  rejects non-invited users. Every RLS policy then checks `is_app_user()`.
