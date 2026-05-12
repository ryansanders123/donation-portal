# Donation Management Template — Design

> Historical design. This file preserves the original design snapshot and
> intentionally does not describe current production state. See
> `docs/STATUS.md` and `README.md` for the current app, database, deployment,
> and security model.

**Date:** 2026-04-16
**First deployment:** Catholic Campus Ministry (CCM), `ccm.pinnacledatascience.com`
**Status:** Design approved in brainstorming. Proceeding to implementation plan.

---

## 1. Context & goals

Build a nonprofit donation management web app. Single-tenant per deployment: each client
nonprofit gets their own Vercel project + Supabase project, all from one shared codebase.

CCM is the first deployment. Future clients will deploy from the same repo with their
own env vars and Supabase/OAuth credentials. Per agreed update model (Model A), all
deployments auto-update from `main` for now; upgrade to branch-per-client when client
count > 1.

**In scope:** SSO (Google + Microsoft), invite-gated access, donation entry with donee
autocomplete, soft-void with reason, monthly and tax-year reports, CSV + print outputs,
admin management of users and funds.

**Out of scope** (per user spec): direct edits to donations, hard deletes, email/password
auth, magic links, email receipts, recurring/pledge donations, accounting exports,
multi-currency.

---

## 2. Architecture

**Stack:** Next.js 14 (App Router) + Supabase (Postgres, Auth).
**Hosting:** Vercel. **Auth providers:** Google, Microsoft/Entra.

**Update propagation (Model A):** all client Vercel projects track `main`. Pushing to
`main` triggers deploys across all client sites. Acceptable at current scale (1 client).
Revisit when adding a second.

**Runtime shape:**

```
Browser ──► Vercel (Next.js, Server Components + Server Actions)
              │
              ├── /auth/callback         (Route Handler: gate logic)
              ├── /report/export         (Route Handler: CSV stream)
              ├── Server Actions         (mutations: add donation, invite, void, …)
              │
              └──► Supabase Postgres (tables + RLS)
                   Supabase Auth        (Google, Microsoft OAuth; identity linking on)
                   @supabase/ssr        (cookie-based sessions)
```

**Folder layout:**

```
ccm-demo/
├── app/
│   ├── (public)/login/page.tsx
│   ├── auth/
│   │   ├── callback/route.ts
│   │   └── signout/route.ts
│   ├── (app)/
│   │   ├── layout.tsx                 # auth gate
│   │   ├── page.tsx                   # redirects to /donations/add
│   │   ├── donations/
│   │   │   ├── add/page.tsx
│   │   │   └── [id]/void/page.tsx
│   │   ├── report/page.tsx
│   │   ├── report/export/route.ts     # CSV stream
│   │   ├── tax-summary/page.tsx
│   │   ├── tax-summary/[doneeId]/[year]/print/page.tsx
│   │   └── admin/
│   │       ├── layout.tsx             # admin gate
│   │       ├── users/page.tsx
│   │       ├── users/invite/page.tsx
│   │       └── funds/page.tsx
│   └── layout.tsx                     # root (branding from env)
├── components/
│   ├── DoneePicker.tsx
│   ├── DonationForm.tsx
│   └── …
├── lib/
│   ├── supabase/server.ts             # Server Component client
│   ├── supabase/client.ts             # browser client
│   ├── supabase/service.ts            # service-role client (server-only)
│   ├── auth.ts                        # currentAppUser()
│   └── csv.ts                         # CSV streaming helpers
├── supabase/
│   └── migrations/
│       ├── 0001_extensions.sql        # citext, pg_trgm
│       ├── 0002_tables.sql            # users, donees, funds, donations
│       ├── 0003_indexes.sql
│       ├── 0004_functions.sql         # current_app_user, is_admin
│       ├── 0005_rls.sql               # policies
│       ├── 0006_triggers.sql          # donations immutability + role guard
│       └── 0007_seed.sql              # Anon donee + General fund
├── tests/
└── .env.local.example
```

**Env vars:**

```
# Public (shipped to browser)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ORG_NAME=Catholic Campus Ministry
NEXT_PUBLIC_ORG_LOGO_URL=/logo.svg
NEXT_PUBLIC_ORG_SUPPORT_EMAIL=steve@example.org
NEXT_PUBLIC_ORG_TAX_STATEMENT=         # shown on tax-summary print view; org-specific IRS language
NEXT_PUBLIC_ORG_ADDRESS=               # shown on tax-summary print view

# Server-only
SUPABASE_SERVICE_ROLE_KEY=            # used only for bootstrap & admin ops that bypass RLS
```

---

## 3. Data model

Tables in `public` schema. Email is case-insensitive via `citext`.

```sql
-- users: app user. Row may predate first sign-in (invite state).
users (
  id             uuid PK default gen_random_uuid(),
  auth_user_id   uuid UNIQUE REFERENCES auth.users(id),   -- null = invited, not yet signed in
  email          citext NOT NULL UNIQUE,
  role           text NOT NULL CHECK (role IN ('admin','user')),
  invited_at     timestamptz NOT NULL DEFAULT now(),     -- row creation (invite, or bootstrap)
  invited_by     uuid REFERENCES users(id),               -- null for first-ever admin
  first_login_at timestamptz,                             -- stamped on first successful sign-in
  last_login_at  timestamptz,                             -- updated on every sign-in
  removed_at     timestamptz                              -- soft-remove blocks sign-in
)

donees (
  id          uuid PK default gen_random_uuid(),
  name        text NOT NULL,
  email       text,
  phone       text,
  address     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES users(id)
)
-- seed: {name: 'Anon'}

funds (
  id           uuid PK default gen_random_uuid(),
  name         text NOT NULL UNIQUE,
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
)
-- seed: {name: 'General'}

donations (
  id                      uuid PK default gen_random_uuid(),
  donee_id                uuid NOT NULL REFERENCES donees(id),
  fund_id                 uuid NOT NULL REFERENCES funds(id),
  type                    text NOT NULL CHECK (type IN ('cash','check','online')),
  amount                  numeric(12,2) NOT NULL CHECK (amount > 0),
  date_received           date NOT NULL DEFAULT current_date,
  check_number            text,
  reference_id            text,
  note                    text,
  created_by              uuid NOT NULL REFERENCES users(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  voided_at               timestamptz,
  voided_by               uuid REFERENCES users(id),
  void_reason             text,
  replaced_by_donation_id uuid REFERENCES donations(id),

  -- conditional-required constraints:
  CHECK ((type = 'check')  = (check_number IS NOT NULL)),
  CHECK ((type = 'online') = (reference_id IS NOT NULL)),
  -- void atomicity:
  CHECK ((voided_at IS NULL) = (voided_by IS NULL AND void_reason IS NULL))
)
```

**Indexes:**

```sql
CREATE UNIQUE INDEX users_email_lower_idx  ON users (lower(email));
CREATE INDEX donations_date_idx            ON donations (date_received DESC);
CREATE INDEX donations_donee_idx           ON donations (donee_id);
CREATE INDEX donations_fund_idx            ON donations (fund_id);
CREATE INDEX donations_active_idx          ON donations (date_received DESC)
  WHERE voided_at IS NULL;                    -- hot path: non-voided queries
CREATE INDEX donees_name_trgm_idx          ON donees USING gin (name gin_trgm_ops);
CREATE INDEX donees_name_lower_idx         ON donees (lower(name));
```

**Helper view** — `users_with_providers` joins `auth.identities` so the user-list page
can show which providers each user has signed in with.

```sql
CREATE VIEW users_with_providers AS
SELECT u.*,
       ARRAY(SELECT provider FROM auth.identities
             WHERE user_id = u.auth_user_id
             ORDER BY created_at) AS providers
FROM users u;
```

**No separate `UserAuthProvider` table** — `auth.identities` already stores
`{user_id, provider, provider_id, created_at, updated_at}` which is exactly what the
spec asked for.

---

## 4. Auth & authorization

### 4.1 Sign-in flow

**Login page** shows the org logo + two buttons: *Sign in with Google*, *Sign in with
Microsoft*. Clicking invokes:

```ts
supabase.auth.signInWithOAuth({
  provider: 'google' | 'azure',
  options: { redirectTo: `${origin}/auth/callback` }
})
```

**Supabase identity linking** is enabled (dashboard toggle: "Link accounts with same
email"). So Alice signing in with Google then Microsoft using the same verified email
resolves to a single `auth.users` row with two `auth.identities` rows.

### 4.2 Callback gate (`/auth/callback`)

1. Exchange `?code=…` for session (`supabase.auth.exchangeCodeForSession`).
2. Read `auth.users` row for the session. If `email_verified !== true` → sign out,
   redirect `/login?error=unverified`.
3. Look up `public.users` by email (`citext` compare):
   - **Row exists, `auth_user_id` is NULL** (invited): stamp `auth_user_id`, set
     `first_login_at = now()`, set `last_login_at = now()` → redirect `/`.
   - **Row exists, `auth_user_id` matches**: set `last_login_at`. If `removed_at` is
     set → sign out, redirect `/login?error=removed`. Else → redirect `/`.
   - **Row exists, `auth_user_id` differs** (identity-link edge case): reject,
     log for investigation.
   - **No row exists**: if `COUNT(*) FROM users = 0` → bootstrap admin (create row
     with `role='admin'`, stamp `auth_user_id`, `first_login_at`, `last_login_at`).
     Else → sign out, redirect `/login?error=not-invited`.

**First-sign-in race protection:** wrap the `count = 0` check + insert in a
Postgres advisory lock (`pg_advisory_xact_lock(1)`) to serialize bootstrap attempts.

### 4.3 Authorization layers

**Two enforcement layers, both required:**

1. **Route-level (Next.js):** `app/(app)/layout.tsx` redirects unauthenticated users to
   `/login`. `app/(app)/admin/layout.tsx` redirects non-admins to `/`.
2. **Database (RLS):** Even if a route check is skipped, the DB refuses. All tables
   have RLS enabled.

**RLS helpers (server-side SECURITY DEFINER functions):**

```sql
CREATE FUNCTION current_app_user() RETURNS public.users LANGUAGE sql STABLE AS $$
  SELECT * FROM public.users
  WHERE auth_user_id = auth.uid() AND removed_at IS NULL
  LIMIT 1;
$$;

CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM current_app_user()), false);
$$;
```

**Policy summary** (full SQL in `0005_rls.sql`):

| Table | Select | Insert | Update | Delete |
|---|---|---|---|---|
| `users` | any signed-in | admin only | admin only | never |
| `donees` | any signed-in | any signed-in | any signed-in | never |
| `funds` | any signed-in | admin only | admin only | never |
| `donations` | any signed-in | any signed-in (must set `created_by = me`) | any signed-in, void-only fields (enforced by trigger) | never |

**Void immutability trigger** — `donations_immutable_fields_trg` fires on UPDATE and
raises if any column other than `voided_at`, `voided_by`, `void_reason`,
`replaced_by_donation_id` has changed. Ensures direct-edits are impossible even if
Server Action logic is bypassed.

**Role safety triggers:**
- `users_last_admin_trg` prevents demoting the final admin or removing the final admin.
- Server Action also guards "can't demote/remove yourself" for UX clarity.

### 4.4 Page-level access matrix

| Route | User | Admin |
|---|---|---|
| `/login`, `/auth/callback`, `/auth/signout` | public | public |
| `/donations/add` | ✅ | ✅ |
| `/donations/[id]/void` | ✅ | ✅ |
| `/report`, `/report/export` | ✅ | ✅ |
| `/tax-summary`, `/tax-summary/[id]/[year]/print` | ✅ | ✅ |
| `/admin/users*` | ❌ → `/` | ✅ |
| `/admin/funds*` | ❌ → `/` | ✅ |

Nav bar conditionally shows admin links.

---

## 5. Donee autocomplete

**Server-side search, triggered from a debounced client input.** Performance requirement:
<300ms against 10,000 donees.

**Query:**

```sql
SELECT id, name, email, phone
FROM donees
WHERE name ILIKE '%' || $1 || '%'
   OR name %       $1                     -- trigram fallback for typos
ORDER BY
  CASE WHEN lower(name) LIKE lower($1) || '%' THEN 0 ELSE 1 END,
  similarity(name, $1) DESC,
  name ASC
LIMIT 10;
```

Three-stage ranking: prefix matches → trigram similarity → alphabetical.

**`DoneePicker` component:**
- Input with 200ms debounce
- Min 2 chars before query fires
- Escapes `%` / `_` in parameter
- Dropdown: matched donees, or "[ + Create new: <typed text> ]" when no match
- Inline create form (name pre-filled, optional email/phone/address) via
  `createDonee` Server Action; returned donee is auto-selected
- Keyboard nav (arrows, Enter, Escape); `role="listbox"` with option-level roles
- Screen reader announces result count

**Perf budget (10k seeded donees):**
- DB query with GIN index: ~5–20ms
- Network RTT: ~30–80ms
- Total: well under 300ms

**"Anon" donee** is in the list like any other — no special casing at the picker.

---

## 6. Reports

### 6.1 Monthly report (`/report`)

- Month/year picker; defaults to current month.
- Server-rendered page (Server Component).
- **Totals panel:** by type (cash/check/online) and by fund.
- **Table:** paginated 25/page; columns: donee, date, type, fund, amount, check/ref #.
- **"Include voided" toggle** (query param `?voided=1`). Voided rows visually struck
  through; still counted separately from the main totals.
- **CSV export** (`/report/export?…`): Route Handler streams CSV matching current filter
  set (month, voided toggle). Header row included. Streamed via
  `ReadableStream` + `TextEncoder` to avoid memory pressure on large months.
- **Default exclude-voided** in totals and table. Toggle changes both totals and table.

### 6.2 Tax summary (`/tax-summary`)

- Donee picker (reuses `DoneePicker`) + tax-year picker (defaults to current year).
- Lists all non-voided donations for that donee in that year, with total.
- **CSV download** for the donee's year.
- **Print-friendly HTML view** (`/tax-summary/[doneeId]/[year]/print`): separate route
  with a clean layout — org header (name + address from env), donee name/address,
  donation list, total, tax statement (from `NEXT_PUBLIC_ORG_TAX_STATEMENT`) —
  suitable for "save as PDF" in browser print dialog. `@media print`
  hides nav/footer.

### 6.3 CSV format

```csv
date,donee,type,fund,amount,check_number,reference_id,note,voided,void_reason
2026-04-15,John Smith,check,General,100.00,1234,,,false,
2026-04-15,Anon,cash,Building,50.00,,,,false,
```

Quoting: RFC 4180. Commas/newlines in notes are quoted with `"`. Internal `"` doubled.

---

## 7. Validation rules (server-side, in Server Actions)

All validation happens server-side regardless of client-side form hints:

| Field | Rule |
|---|---|
| `amount` | `> 0`, max 2 decimals, ≤ 99,999,999.99 |
| `type` | one of `cash`, `check`, `online` |
| `check_number` | required iff `type = 'check'`; trimmed; max 50 chars |
| `reference_id` | required iff `type = 'online'`; trimmed; max 100 chars |
| `fund_id` | required; must reference non-archived fund at insert time |
| `donee_id` | required; must reference existing donee |
| `date_received` | not in future (>1 day tolerance for TZ); not before year 2000 |
| `void_reason` | required on void; trimmed; 1–500 chars |
| `email` (invite) | valid format; not already in `users` |

Per-check enforced at DB level via CHECK constraints where feasible
(`amount > 0`, type/check_number/reference_id coupling). Business-logic checks
(archived fund, future dates) live in Server Actions.

---

## 8. Template-per-client operations

**New-client setup checklist** (kept in repo `docs/ops/new-client.md`):

1. Create Supabase project (client-specific name). Note URL + anon key + service role key.
2. Run `supabase db push` against the new project to apply all migrations.
3. In Supabase dashboard: Authentication → Providers → enable Google + Microsoft;
   paste OAuth client IDs/secrets (one set per deployment — OAuth apps are per-domain).
4. In Supabase dashboard: Authentication → Settings → enable *"Link accounts with same
   email"*.
5. Create Google OAuth client (Google Cloud Console, authorized redirect =
   `https://<client-domain>/auth/callback`).
6. Create Microsoft Entra app registration (redirect same).
7. Create Vercel project from `ryansanders123/ccm-demo` repo. Root: `./`.
8. Set env vars in Vercel (6 vars listed in §2).
9. Add custom domain in Vercel. Point client's DNS (CNAME or A record to Vercel).
10. Deploy; first sign-in bootstraps admin.

---

## 9. Testing & done criteria

**Test layers:**
- **Unit:** Server Actions, validation helpers, CSV generation. Vitest.
- **Integration:** Database functions (`current_app_user`, `is_admin`, triggers) via
  `pg-mem` or a real test Supabase project. Seeded data.
- **End-to-end (smoke):** Playwright against a local Supabase instance. Covers the
  12 done criteria below.

**Done criteria mapping (from user spec → verification):**

| # | Criterion | Verification |
|---|---|---|
| 1 | Login shows Google + Microsoft | Playwright: `/login` → both buttons visible |
| 2 | First sign-in → admin | Integration test: empty DB, simulated OAuth → `users.role='admin'` |
| 3 | Same email across providers = one account | Integration: sign in Google, sign out, sign in Microsoft → one `users` row, two `auth.identities` rows |
| 4 | Invited user gets user-only permissions | Playwright: admin invites, user signs in, admin nav hidden, `/admin/users` redirects |
| 5 | Un-invited email rejected | Integration: non-empty DB + un-invited email → callback redirects `/login?error=not-invited` |
| 6 | Add donation against existing + inline-created donee | Playwright: both flows reach the success state |
| 7 | Check / online / cash field requirements | Unit + Playwright: each type's conditional requireds enforced |
| 8 | Monthly report totals + CSV | Integration: seed known donations, assert totals match; CSV assert row count and bytes |
| 9 | Void + "include voided" toggle | Playwright: void with reason → row hidden from default view, visible with toggle |
| 10 | Tax summary CSV + print view | Playwright: both routes render, CSV valid |
| 11 | Autocomplete < 300ms @ 10k donees | Load-test script: seed 10k donees, p95 latency assertion |
| 12 | Archived fund absent from dropdown, preserved on history | Playwright + integration: archive fund, Add Donation dropdown excludes it, existing donations with that fund still show fund name |

---

## 10. Open items / deferred

None blocking. Deferred for post-MVP:
- Per-client theme colors beyond logo (only `NEXT_PUBLIC_ORG_NAME` and logo are in MVP)
- Role-level granularity beyond `admin`/`user`
- Audit log UI (data is already captured in `voided_by` etc.; just no page to view it)
- Supabase Edge Functions for webhook-triggered imports (e.g., PayPal/Stripe → auto-donation)

---

## Appendix A: SQL file ordering

Migrations applied in filename order. Do not renumber once deployed — append only.

## Appendix B: Why these choices

- **Next.js App Router** — auth gate in a layout does one DB hop for entire subtree.
- **Supabase Auth over Auth.js** — identity linking by email is a dashboard toggle,
  not custom adapter code. RLS uses `auth.uid()` directly.
- **`citext` over `text` + `lower()`** — email lookups are case-insensitive throughout.
- **RLS + app-layer gate** — defense in depth. Either alone is insufficient.
- **Soft-delete only** — spec requirement; supports audit trail, reversible error
  handling, and tax-year recomputation.
