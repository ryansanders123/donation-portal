# Cutover & Rename: Demo → Prod, Multi-Tenant Foundation

> Historical design. This file preserves the 2026-05-05 cutover snapshot. See
> `docs/STATUS.md` and `README.md` for the current production state.

**Date:** 2026-05-05
**Status:** Approved (ready for plan)
**Owner:** Ryan Sanders

## Goal

Promote `ccm-demo` from a single-tenant demo to a generically-named production app
(`donation-portal` / "Pinnacle Donations") with a multi-tenant schema foundation.
Catholic Campus Ministry (CCMC) becomes the first organization in a system
designed to host tens more without per-org code forks.

This is task **E** in the seven-task roadmap. Per-org branding, feature flags,
org switcher, and onboarding flow are deferred to **task 6**.

## Why

Going multi-tenant later — after CSV/API imports, identity resolution, and
reporting features land in single-tenant code — would force a costly
schema-and-RLS retrofit across every domain table. Doing the foundation now,
while only one org's data exists, makes the backfill trivial and lets every
subsequent feature inherit correct multi-tenant behavior from day one.

## Scope

### In scope

1. **Rename infrastructure** — GitHub repo, Vercel project, Supabase project,
   local working directory, `package.json`, `supabase/config.toml`,
   `NEXT_PUBLIC_ORG_NAME` env var.
2. **Multi-tenant schema** — `organizations` table, `organization_id` FK on
   every domain table, backfill, per-org RLS scoping, `current_org_id()`
   helper.
3. **Production hardening** — Supabase Site URL + redirect allow-list,
   GitHub branch protection on `main`.
4. **Tests** — preserve existing test pass; add tenant-isolation test and
   default-injection test.

### Out of scope (task 6)

- Per-org logo / colors / display name from the database
- Per-org feature flags
- Org switcher UI
- New-org onboarding flow
- User → org assignment UI

## Naming decisions

| Identifier | Old | New |
|---|---|---|
| GitHub repo | `ccm-demo` | `donation-portal` |
| Vercel project | `ccm-demo` | `donation-portal` |
| Supabase project name | `ccm-demo` | `Pinnacle Donations` |
| Supabase project ref | `eqlutbgwsnyhdkaubjbh` | (unchanged — no env updates) |
| `package.json` name | `ccm-demo` | `donation-portal` |
| `supabase/config.toml` project_id | `ccm-demo` | `donation-portal` |
| App display name (`NEXT_PUBLIC_ORG_NAME`) | varies | `Pinnacle Donations` |
| Local working dir | `…\pinnacle\ccm-demo` | `…\pinnacle\donation-portal` |
| Public domain | `ccm.pinnacledatascience.com` | (unchanged for now) |
| First org slug | n/a | `ccmc` (display: "Catholic Campus Ministry") |

The public subdomain stays `ccm.pinnacledatascience.com` for this cutover; a
later task may move to a generic subdomain or an org-aware host.

## Architecture

### Schema — migration `0007_multi_tenant_foundation.sql`

```sql
-- New table
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug citext UNIQUE NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed first row
INSERT INTO public.organizations (slug, name)
VALUES ('ccmc', 'Catholic Campus Ministry');

-- Helper: current user's org
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.users
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$;

-- Add FK to each domain table (nullable temporarily for backfill)
ALTER TABLE public.users      ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.donees     ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.funds      ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.donations  ADD COLUMN organization_id uuid REFERENCES public.organizations(id);

-- Backfill (only one org exists, so all rows point to it)
UPDATE public.users      SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'ccmc');
UPDATE public.donees     SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'ccmc');
UPDATE public.funds      SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'ccmc');
UPDATE public.donations  SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'ccmc');

-- Enforce NOT NULL + auto-default for future inserts
ALTER TABLE public.users      ALTER COLUMN organization_id SET NOT NULL,
                              ALTER COLUMN organization_id SET DEFAULT public.current_org_id();
ALTER TABLE public.donees     ALTER COLUMN organization_id SET NOT NULL,
                              ALTER COLUMN organization_id SET DEFAULT public.current_org_id();
ALTER TABLE public.funds      ALTER COLUMN organization_id SET NOT NULL,
                              ALTER COLUMN organization_id SET DEFAULT public.current_org_id();
ALTER TABLE public.donations  ALTER COLUMN organization_id SET NOT NULL,
                              ALTER COLUMN organization_id SET DEFAULT public.current_org_id();

-- Hot-path indexes
CREATE INDEX donations_org_idx ON public.donations(organization_id);
CREATE INDEX donees_org_idx    ON public.donees(organization_id);
```

### RLS — extend existing policies

Every policy that currently checks `public.is_app_user()` gains
`AND organization_id = public.current_org_id()`. Same for `is_admin()`
mutation policies. The migration drops and recreates each policy
idempotently.

CCMC users see no behavior change. A future second org's users would
be silently fenced off — RLS denies cross-org reads/writes without a
visible error.

### App code touches

The column DEFAULT removes most app-code work. Existing INSERTs
(donation add, donee add, fund create, void) succeed unchanged.

**The only code change:** the admin invite server action in
`app/(app)/admin/actions.ts` explicitly sets `organization_id` on the
new `public.users` row, derived from the inviting admin's org. Without
this, an invited row would default to the *invoker's* org via
`current_org_id()` — which happens to be correct for now, but explicit
is safer and survives a future "super-admin invites across orgs" feature.

## Components

| File | Change |
|---|---|
| `supabase/migrations/0007_multi_tenant_foundation.sql` | **New.** Full migration above. |
| `app/(app)/admin/actions.ts` (invite server action) | Set `organization_id` from inviter when inserting the new `public.users` row. |
| `package.json` | `name` → `donation-portal`. |
| `supabase/config.toml` | `project_id` → `donation-portal`. |
| `.env.local.example` | `NEXT_PUBLIC_ORG_NAME=Pinnacle Donations`. |
| `README.md` | Project name, hostname, description, Supabase ref note. |
| `docs/STATUS.md` | Reflect cutover completion. |
| `docs/sso-setup.md` | Update project name references. |
| `docs/ops/done-criteria.md` | Update project name references. |
| `playwright.config.ts` | Update header comment ("Playwright E2E config for CCM" → "for Pinnacle Donations"). |
| `tests/lib/multi-tenant.test.ts` | **New.** Default-injection + tenant-isolation. |

Historical files in `docs/superpowers/specs/` and `docs/superpowers/plans/`
from the original donation-mgmt build are **left untouched** — they are
history, not live docs.

## Data flow

No user-facing data flow changes. RLS enforcement is server-side and
transparent to the app:

1. User logs in → Supabase issues JWT with `auth.uid()`.
2. Server-side Supabase client makes a query.
3. RLS policy evaluates: `is_app_user() AND organization_id = current_org_id()`.
4. `current_org_id()` resolves to CCMC's id from `public.users`.
5. Query returns only CCMC rows (currently the only rows).

For inserts:

1. App calls `INSERT INTO donations (donee_id, fund_id, amount, ...)` — no `organization_id`.
2. Postgres applies DEFAULT `current_org_id()` → row gets CCMC's id.
3. RLS WITH CHECK passes because the inserted org id matches `current_org_id()`.

## Error handling

- **`current_org_id()` returns NULL** (e.g., user row not yet linked, or
  user removed). All inserts and queries fail RLS with a 403-equivalent
  Postgres error. Correct behavior — surfaces the broken state instead of
  silently writing orphan rows.
- **Migration failure mid-run.** Each statement is in a single
  transaction (the `apply-migrations.mjs` runner wraps each file). A
  partial failure rolls back; safe to re-run after fix.
- **OAuth Site URL misconfiguration.** If forgotten, Google sign-in
  redirects to localhost. Documented in the runbook step 5.

## Testing

Existing tests must still pass:
- `npm test` — all Vitest unit tests for reports, validators, dashboard.
- `npm run test:e2e` — Playwright smoke (login, unauth redirect).

New tests:

- **`tests/lib/multi-tenant.test.ts`**
  - *Default injection.* As a CCMC user, INSERT a donation without
    `organization_id`; SELECT it back; assert `organization_id` equals
    CCMC's id.
  - *Tenant isolation.* Seed a second org + user via service-role
    client; switch session to a CCMC user; assert SELECT on the second
    org's rows returns zero. Assert INSERT with another org's
    `organization_id` fails RLS.
- **Manual smoke.** After deploy, hit `/api/whoami`. Confirm:
  - `auth_user` resolved
  - `app_user.organization_id` matches CCMC
  - `donation_count_under_rls` equals the previous total (12,023-class
    number — backfill verified).

## Rollout plan

Single branch: `cutover/donation-portal`.

**Commit 1 — Rename.** Mechanical find-and-replace plus dashboard
actions:
1. GitHub: rename repo `ccm-demo` → `donation-portal`. Update local
   `git remote set-url origin https://github.com/ryansanders123/donation-portal.git`.
2. Local dir: rename `ccm-demo` → `donation-portal` after closing
   editor handles.
3. Edit `package.json`, `supabase/config.toml`, `.env.local.example`,
   `README.md`, `docs/STATUS.md`, `docs/sso-setup.md`,
   `docs/ops/done-criteria.md`, `playwright.config.ts`.
4. Vercel: rename project in dashboard. Confirm alias still on
   `ccm.pinnacledatascience.com`.
5. Supabase: rename project in dashboard to "Pinnacle Donations".
   Project ref stays `eqlutbgwsnyhdkaubjbh`.
6. Set Supabase Auth Site URL = `https://ccm.pinnacledatascience.com`,
   redirect allow-list = `https://ccm.pinnacledatascience.com/**`.

**Commit 2 — Multi-tenant foundation.**
1. Add `supabase/migrations/0007_multi_tenant_foundation.sql`.
2. Update admin invite handler to set `organization_id`.
3. Add `tests/lib/multi-tenant.test.ts`.
4. Run `npm test` + `npm run test:e2e` — green.

**Merge.** Open PR (single, two commits), self-review, merge to `main`.
Vercel auto-deploys.

**Post-merge.**
1. Run `node scripts/apply-migrations.mjs` against the pooler.
2. Hit `/api/whoami` — verify org id and donation count.
3. Hit home page logged in as `rpsanders01@gmail.com` — verify
   donations list loads, chart renders, no errors.
4. Enable GitHub branch protection on `main`: require PR, require
   status checks (Vercel deploy + tests).

**Rollback.** If migration breaks production:
1. Revert merge commit.
2. Migration is the only DB change — manually drop column + table:
   ```sql
   ALTER TABLE public.donations DROP COLUMN organization_id;
   ALTER TABLE public.funds DROP COLUMN organization_id;
   ALTER TABLE public.donees DROP COLUMN organization_id;
   ALTER TABLE public.users DROP COLUMN organization_id;
   DROP FUNCTION public.current_org_id();
   DROP TABLE public.organizations;
   -- Plus restore original RLS policies from 0005/0006.
   ```
3. No data loss — backfill is idempotent and reversible.

## Open questions

None. All sequencing, naming, and scope decisions are settled in this
spec.

## References

- Project memory: `memory/ccm-demo.md`
- Original donation-mgmt spec: `docs/superpowers/specs/2026-04-16-donation-mgmt-design.md`
- Composite-NULL RLS bugfix (precedent for RLS migrations): `supabase/migrations/0006_fix_rls_composite_null.sql`
