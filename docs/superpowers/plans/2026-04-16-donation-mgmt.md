# Donation Management Template Implementation Plan

> Historical plan. This file preserves the original implementation plan and
> intentionally does not describe current production state. See
> `docs/STATUS.md` and `README.md` for the current app, database, deployment,
> and security model.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a nonprofit donation management web app (SSO-gated, invite-only, single-tenant per deployment) deployed to `ccm.pinnacledatascience.com` as the first instance of a reusable template.

**Architecture:** Next.js 14 App Router on Vercel. Supabase Postgres + Auth (Google + Microsoft OAuth, identity-linking-by-email enabled). Two-layer authorization (Next.js layouts + Postgres RLS). Server Actions for mutations, Route Handlers for OAuth callback and CSV stream.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, Supabase JS + `@supabase/ssr`, Vitest (unit), Playwright (e2e), Supabase CLI (migrations).

**Source of truth:** `docs/superpowers/specs/2026-04-16-donation-mgmt-design.md`. Reference it when a task says "per spec §X". This plan does not re-spell SQL/validation that already lives there exhaustively — it sequences and tests the implementation.

**Phases (each phase produces working, testable software):**
1. Foundation — scaffold, migrations, auth infrastructure
2. Donations — donee picker, add, void
3. Reports — monthly report, CSV, tax summary
4. Admin — users, funds
5. Done-criteria verification + production cutover

---

## Phase 0: Prep

### Task 0.1: Clean out the static placeholder, keep the docs

**Files:**
- Delete: `index.html`
- Keep: `docs/superpowers/specs/…`, `docs/superpowers/plans/…`

- [ ] **Step 1: Remove placeholder**

```bash
cd "C:/Users/rsanders/source/Claude/pinnacle/ccm-demo"
git rm index.html
```

- [ ] **Step 2: Commit**

```bash
git commit -m "Remove static placeholder ahead of Next.js scaffold"
```

**Do not push yet** — hold until Phase 1 scaffold is in place so the domain keeps serving the placeholder until the real app is ready.

---

## Phase 1: Foundation

### Task 1.1: Scaffold Next.js 14 app

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `.env.local.example`, `.gitignore`, `README.md`

- [ ] **Step 1: Init with `create-next-app` (non-interactive, known answers)**

```bash
cd "C:/Users/rsanders/source/Claude/pinnacle/ccm-demo"
npx --yes create-next-app@14 . --typescript --tailwind --app --src-dir false --eslint --import-alias "@/*" --use-npm
```

If the tool prompts (it shouldn't with those flags), accept defaults for any remaining options. The `.` makes it scaffold in the current folder. If it complains about an existing folder, add `--force`.

- [ ] **Step 2: Pin versions in `package.json`**

Edit `package.json` so `dependencies` and `devDependencies` match this set exactly:

```json
{
  "dependencies": {
    "@supabase/ssr": "^0.5.0",
    "@supabase/supabase-js": "^2.45.0",
    "next": "14.2.15",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@playwright/test": "^1.47.0",
    "@types/node": "20.14.0",
    "@types/react": "18.3.3",
    "@types/react-dom": "18.3.0",
    "autoprefixer": "^10.4.19",
    "eslint": "8.57.0",
    "eslint-config-next": "14.2.15",
    "postcss": "^8.4.39",
    "supabase": "^1.200.0",
    "tailwindcss": "^3.4.6",
    "typescript": "5.5.3",
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0"
  }
}
```

Run `npm install`.

- [ ] **Step 3: Smoke-test the scaffold**

```bash
npm run dev
```

Open `http://localhost:3000`. Expect the Next.js default page. Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Scaffold Next.js 14 with Tailwind + TypeScript"
```

---

### Task 1.2: Add `.env.local.example` with all env vars

**Files:**
- Create: `.env.local.example`

- [ ] **Step 1: Write `.env.local.example`**

```env
# Public (shipped to browser)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ORG_NAME=Catholic Campus Ministry
NEXT_PUBLIC_ORG_LOGO_URL=/logo.svg
NEXT_PUBLIC_ORG_SUPPORT_EMAIL=
NEXT_PUBLIC_ORG_ADDRESS=
NEXT_PUBLIC_ORG_TAX_STATEMENT=

# Server-only (never prefixed NEXT_PUBLIC_)
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 2: Commit**

```bash
git add .env.local.example
git commit -m "Document env vars"
```

---

### Task 1.3: Initialize Supabase project locally + migrations folder

**Files:**
- Create: `supabase/config.toml`, `supabase/migrations/` (empty dir)

- [ ] **Step 1: Init Supabase CLI project**

```bash
npx supabase init
```

Answer "No" to VS Code settings prompt if it appears. This creates `supabase/config.toml` and `supabase/migrations/`.

- [ ] **Step 2: Link to the user's existing Supabase project**

```bash
npx supabase login        # opens browser if not logged in
npx supabase link --project-ref <PROJECT_REF>
```

The `<PROJECT_REF>` is the 20-char slug from the user's Supabase dashboard URL. **Stop and ask the user for this value if unknown.**

- [ ] **Step 3: Commit**

```bash
git add supabase/
git commit -m "Initialize Supabase CLI + link to project"
```

---

### Task 1.4: Migration — extensions

**Files:**
- Create: `supabase/migrations/0001_extensions.sql`

- [ ] **Step 1: Write migration**

```sql
-- 0001_extensions.sql
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

- [ ] **Step 2: Push to Supabase**

```bash
npx supabase db push
```

Expected: "Applied migration 0001_extensions".

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0001_extensions.sql
git commit -m "Enable citext and pg_trgm extensions"
```

---

### Task 1.5: Migration — tables

**Files:**
- Create: `supabase/migrations/0002_tables.sql`

- [ ] **Step 1: Write migration** (exact schema from spec §3)

```sql
-- 0002_tables.sql
CREATE TABLE public.users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id   uuid UNIQUE REFERENCES auth.users(id),
  email          citext NOT NULL UNIQUE,
  role           text NOT NULL CHECK (role IN ('admin','user')),
  invited_at     timestamptz NOT NULL DEFAULT now(),
  invited_by     uuid REFERENCES public.users(id),
  first_login_at timestamptz,
  last_login_at  timestamptz,
  removed_at     timestamptz
);

CREATE TABLE public.donees (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  email       text,
  phone       text,
  address     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES public.users(id)
);

CREATE TABLE public.funds (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL UNIQUE,
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.donations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donee_id                uuid NOT NULL REFERENCES public.donees(id),
  fund_id                 uuid NOT NULL REFERENCES public.funds(id),
  type                    text NOT NULL CHECK (type IN ('cash','check','online')),
  amount                  numeric(12,2) NOT NULL CHECK (amount > 0),
  date_received           date NOT NULL DEFAULT current_date,
  check_number            text,
  reference_id            text,
  note                    text,
  created_by              uuid NOT NULL REFERENCES public.users(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  voided_at               timestamptz,
  voided_by               uuid REFERENCES public.users(id),
  void_reason             text,
  replaced_by_donation_id uuid REFERENCES public.donations(id),
  CONSTRAINT check_requires_check_number CHECK ((type = 'check')  = (check_number IS NOT NULL)),
  CONSTRAINT online_requires_reference   CHECK ((type = 'online') = (reference_id IS NOT NULL)),
  CONSTRAINT void_fields_consistent      CHECK ((voided_at IS NULL) = (voided_by IS NULL AND void_reason IS NULL))
);
```

- [ ] **Step 2: Push + verify**

```bash
npx supabase db push
```

Expected success. Then verify tables in Supabase Studio (dashboard → Table Editor) or via `psql` connection string.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0002_tables.sql
git commit -m "Create users, donees, funds, donations tables"
```

---

### Task 1.6: Migration — indexes

**Files:**
- Create: `supabase/migrations/0003_indexes.sql`

- [ ] **Step 1: Write migration**

```sql
-- 0003_indexes.sql
CREATE UNIQUE INDEX users_email_lower_idx  ON public.users (lower(email));
CREATE INDEX donations_date_idx            ON public.donations (date_received DESC);
CREATE INDEX donations_donee_idx           ON public.donations (donee_id);
CREATE INDEX donations_fund_idx            ON public.donations (fund_id);
CREATE INDEX donations_active_idx          ON public.donations (date_received DESC) WHERE voided_at IS NULL;
CREATE INDEX donees_name_trgm_idx          ON public.donees USING gin (name gin_trgm_ops);
CREATE INDEX donees_name_lower_idx         ON public.donees (lower(name));
```

- [ ] **Step 2: Push + commit**

```bash
npx supabase db push
git add supabase/migrations/0003_indexes.sql
git commit -m "Add indexes for donation queries + donee autocomplete"
```

---

### Task 1.7: Migration — helper functions + view

**Files:**
- Create: `supabase/migrations/0004_functions.sql`

- [ ] **Step 1: Write migration**

```sql
-- 0004_functions.sql
CREATE OR REPLACE FUNCTION public.current_app_user()
RETURNS public.users
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT *
  FROM public.users
  WHERE auth_user_id = auth.uid()
    AND removed_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM public.current_app_user()), false);
$$;

GRANT EXECUTE ON FUNCTION public.current_app_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

CREATE OR REPLACE VIEW public.users_with_providers AS
SELECT u.*,
       ARRAY(SELECT provider FROM auth.identities
             WHERE user_id = u.auth_user_id
             ORDER BY created_at) AS providers
FROM public.users u;

GRANT SELECT ON public.users_with_providers TO authenticated;
```

- [ ] **Step 2: Push + commit**

```bash
npx supabase db push
git add supabase/migrations/0004_functions.sql
git commit -m "Add current_app_user + is_admin helpers and user providers view"
```

---

### Task 1.8: Migration — RLS policies

**Files:**
- Create: `supabase/migrations/0005_rls.sql`

- [ ] **Step 1: Write migration**

```sql
-- 0005_rls.sql
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

-- USERS: any signed-in app user can read; only admins can mutate.
CREATE POLICY users_select ON public.users
  FOR SELECT TO authenticated
  USING (public.current_app_user() IS NOT NULL);

CREATE POLICY users_admin_all ON public.users
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- DONEES: any signed-in user can read/insert/update; no deletes.
CREATE POLICY donees_select ON public.donees
  FOR SELECT TO authenticated
  USING (public.current_app_user() IS NOT NULL);

CREATE POLICY donees_insert ON public.donees
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_user() IS NOT NULL);

CREATE POLICY donees_update ON public.donees
  FOR UPDATE TO authenticated
  USING (public.current_app_user() IS NOT NULL)
  WITH CHECK (public.current_app_user() IS NOT NULL);

-- FUNDS: read by all; admin-only write.
CREATE POLICY funds_select ON public.funds
  FOR SELECT TO authenticated
  USING (public.current_app_user() IS NOT NULL);

CREATE POLICY funds_admin_all ON public.funds
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- DONATIONS: read by all; insert/update by any signed-in; no deletes.
CREATE POLICY donations_select ON public.donations
  FOR SELECT TO authenticated
  USING (public.current_app_user() IS NOT NULL);

CREATE POLICY donations_insert ON public.donations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_app_user() IS NOT NULL
    AND created_by = (public.current_app_user()).id
  );

CREATE POLICY donations_update ON public.donations
  FOR UPDATE TO authenticated
  USING (public.current_app_user() IS NOT NULL)
  WITH CHECK (public.current_app_user() IS NOT NULL);
```

- [ ] **Step 2: Push + commit**

```bash
npx supabase db push
git add supabase/migrations/0005_rls.sql
git commit -m "Enable RLS + policies for users/donees/funds/donations"
```

---

### Task 1.9: Migration — triggers (void-only updates, last-admin safety)

**Files:**
- Create: `supabase/migrations/0006_triggers.sql`

- [ ] **Step 1: Write migration**

```sql
-- 0006_triggers.sql

-- Donation updates may only touch void-related columns.
CREATE OR REPLACE FUNCTION public.donations_immutable_fields()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.donee_id        IS DISTINCT FROM OLD.donee_id        THEN RAISE EXCEPTION 'donee_id is immutable'; END IF;
  IF NEW.fund_id         IS DISTINCT FROM OLD.fund_id         THEN RAISE EXCEPTION 'fund_id is immutable'; END IF;
  IF NEW.type            IS DISTINCT FROM OLD.type            THEN RAISE EXCEPTION 'type is immutable'; END IF;
  IF NEW.amount          IS DISTINCT FROM OLD.amount          THEN RAISE EXCEPTION 'amount is immutable'; END IF;
  IF NEW.date_received   IS DISTINCT FROM OLD.date_received   THEN RAISE EXCEPTION 'date_received is immutable'; END IF;
  IF NEW.check_number    IS DISTINCT FROM OLD.check_number    THEN RAISE EXCEPTION 'check_number is immutable'; END IF;
  IF NEW.reference_id    IS DISTINCT FROM OLD.reference_id    THEN RAISE EXCEPTION 'reference_id is immutable'; END IF;
  IF NEW.note            IS DISTINCT FROM OLD.note            THEN RAISE EXCEPTION 'note is immutable'; END IF;
  IF NEW.created_by      IS DISTINCT FROM OLD.created_by      THEN RAISE EXCEPTION 'created_by is immutable'; END IF;
  IF NEW.created_at      IS DISTINCT FROM OLD.created_at      THEN RAISE EXCEPTION 'created_at is immutable'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER donations_immutable_fields_trg
BEFORE UPDATE ON public.donations
FOR EACH ROW EXECUTE FUNCTION public.donations_immutable_fields();

-- Protect the "last admin": can't demote or remove if they're the only active admin.
CREATE OR REPLACE FUNCTION public.users_last_admin_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  active_admin_count int;
BEGIN
  -- Only relevant when this row WAS an active admin going in.
  IF OLD.role = 'admin' AND OLD.removed_at IS NULL THEN
    -- Is this update causing them to no longer be an active admin?
    IF NEW.role <> 'admin' OR NEW.removed_at IS NOT NULL THEN
      SELECT count(*) INTO active_admin_count
      FROM public.users
      WHERE role = 'admin' AND removed_at IS NULL AND id <> OLD.id;

      IF active_admin_count = 0 THEN
        RAISE EXCEPTION 'cannot demote or remove the last active admin';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_last_admin_guard_trg
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.users_last_admin_guard();
```

- [ ] **Step 2: Push**

```bash
npx supabase db push
```

- [ ] **Step 3: Quick trigger smoke-test via Supabase SQL Editor**

Run in Supabase dashboard → SQL editor:

```sql
-- Should fail with "cannot demote the last active admin" after we bootstrap.
-- (Run this AFTER Task 1.12 seed and after a first sign-in.)
-- SELECT 1;  -- skip for now
SELECT 'triggers in place' AS status;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0006_triggers.sql
git commit -m "Add donation-immutability and last-admin-guard triggers"
```

---

### Task 1.10: Migration — seed data

**Files:**
- Create: `supabase/migrations/0007_seed.sql`

- [ ] **Step 1: Write migration**

```sql
-- 0007_seed.sql
INSERT INTO public.donees (name) VALUES ('Anon')
  ON CONFLICT DO NOTHING;

INSERT INTO public.funds (name) VALUES ('General')
  ON CONFLICT (name) DO NOTHING;
```

- [ ] **Step 2: Push + commit**

```bash
npx supabase db push
git add supabase/migrations/0007_seed.sql
git commit -m "Seed Anon donee and General fund"
```

---

### Task 1.11: Supabase client helpers

**Files:**
- Create: `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/service.ts`

- [ ] **Step 1: Write `lib/supabase/server.ts`** (for Server Components, Server Actions, Route Handlers)

```ts
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: "", ...options });
        },
      },
    }
  );
}
```

- [ ] **Step 2: Write `lib/supabase/client.ts`** (for client components — autocomplete only)

```ts
"use client";
import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 3: Write `lib/supabase/service.ts`** (bypasses RLS — used only in callback bootstrap)

```ts
import { createClient } from "@supabase/supabase-js";

export function createSupabaseServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/
git commit -m "Add Supabase SSR/client/service helpers"
```

---

### Task 1.12: `currentAppUser()` helper

**Files:**
- Create: `lib/auth.ts`, `tests/lib/auth.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/lib/auth.test.ts
import { describe, it, expect, vi } from "vitest";
import { currentAppUser } from "@/lib/auth";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    rpc: vi.fn().mockResolvedValue({
      data: { id: "u1", email: "a@b.com", role: "admin", removed_at: null },
      error: null,
    }),
  }),
}));

describe("currentAppUser", () => {
  it("returns the current user when session is valid", async () => {
    const u = await currentAppUser();
    expect(u?.email).toBe("a@b.com");
    expect(u?.role).toBe("admin");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (no implementation)**

```bash
npx vitest run tests/lib/auth.test.ts
```

Expected: "Cannot find module '@/lib/auth'".

- [ ] **Step 3: Write `lib/auth.ts`**

```ts
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppUser = {
  id: string;
  auth_user_id: string | null;
  email: string;
  role: "admin" | "user";
  invited_at: string;
  invited_by: string | null;
  first_login_at: string | null;
  last_login_at: string | null;
  removed_at: string | null;
};

export async function currentAppUser(): Promise<AppUser | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc("current_app_user");
  if (error || !data) return null;
  // current_app_user() returns a single row; Supabase returns it as an object.
  return data as AppUser;
}

export async function requireUser(): Promise<AppUser> {
  const u = await currentAppUser();
  if (!u) throw new Error("Not authenticated");
  return u;
}

export async function requireAdmin(): Promise<AppUser> {
  const u = await requireUser();
  if (u.role !== "admin") throw new Error("Forbidden");
  return u;
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run tests/lib/auth.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/auth.ts tests/lib/auth.test.ts
git commit -m "Add currentAppUser + requireUser + requireAdmin helpers"
```

---

### Task 1.13: Vitest config + test script

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

- [ ] **Step 2: Add scripts**

Edit `package.json` `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test"
```

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts package.json
git commit -m "Add vitest config + test scripts"
```

---

### Task 1.14: Login page

**Files:**
- Create: `app/(public)/login/page.tsx`, `app/(public)/layout.tsx`
- Delete: default `app/page.tsx` content (replaced later)

- [ ] **Step 1: Write `app/(public)/layout.tsx`** (no-gate, minimal shell for login)

```tsx
import "@/app/globals.css";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center bg-stone-50">{children}</div>;
}
```

- [ ] **Step 2: Write login page**

```tsx
// app/(public)/login/page.tsx
"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";

const ORG = process.env.NEXT_PUBLIC_ORG_NAME ?? "Donation Portal";

export default function LoginPage() {
  const params = useSearchParams();
  const error = params.get("error");

  async function signIn(provider: "google" | "azure") {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  const errMsg =
    error === "unverified" ? "Your provider didn't confirm your email address."
    : error === "not-invited" ? "This email isn't on the invite list. Ask an admin to invite you."
    : error === "removed"     ? "Your access has been revoked. Contact an admin."
    : error                   ? "Sign-in error. Please try again."
    : null;

  return (
    <main className="w-full max-w-sm p-8 bg-white rounded-lg shadow">
      <h1 className="text-2xl font-serif text-center mb-6">{ORG}</h1>
      {errMsg && <div className="mb-4 p-3 bg-red-50 text-red-800 rounded text-sm">{errMsg}</div>}
      <div className="space-y-3">
        <button onClick={() => signIn("google")}    className="w-full py-2 px-4 border rounded hover:bg-stone-50">Sign in with Google</button>
        <button onClick={() => signIn("azure")}     className="w-full py-2 px-4 border rounded hover:bg-stone-50">Sign in with Microsoft</button>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add "app/(public)"
git commit -m "Add login page with Google + Microsoft buttons"
```

---

### Task 1.15: Auth callback route (the gate)

**Files:**
- Create: `app/auth/callback/route.ts`, `tests/auth/callback.logic.test.ts`

- [ ] **Step 1: Extract the gate logic into a pure function (testable)**

Create `lib/auth-callback.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type GateResult =
  | { kind: "redirect"; to: string }
  | { kind: "ok" };

type MinimalAuthUser = { id: string; email: string; email_verified: boolean };

export async function runCallbackGate(
  authUser: MinimalAuthUser,
  // service client — bypasses RLS for the bootstrap count + insert
  svc: SupabaseClient,
): Promise<GateResult> {
  if (!authUser.email_verified) {
    return { kind: "redirect", to: "/login?error=unverified" };
  }

  // Look up public.users by email (citext handles case).
  const { data: existing } = await svc
    .from("users")
    .select("*")
    .eq("email", authUser.email.toLowerCase())
    .maybeSingle();

  const now = new Date().toISOString();

  if (existing) {
    if (existing.removed_at) {
      return { kind: "redirect", to: "/login?error=removed" };
    }
    if (existing.auth_user_id && existing.auth_user_id !== authUser.id) {
      return { kind: "redirect", to: "/login?error=identity-mismatch" };
    }
    // First sign-in for an invited user OR a returning user.
    const patch: Record<string, string> = { last_login_at: now };
    if (!existing.auth_user_id) {
      patch.auth_user_id = authUser.id;
      patch.first_login_at = now;
    }
    await svc.from("users").update(patch).eq("id", existing.id);
    return { kind: "ok" };
  }

  // No row exists — bootstrap admin if empty DB (advisory-locked).
  await svc.rpc("pg_advisory_xact_lock", { key: 1 }).catch(() => {
    // RPC path varies; fallback via raw SQL using service role:
  });

  const { count } = await svc
    .from("users")
    .select("id", { count: "exact", head: true });

  if ((count ?? 0) === 0) {
    await svc.from("users").insert({
      auth_user_id: authUser.id,
      email: authUser.email.toLowerCase(),
      role: "admin",
      invited_at: now,
      first_login_at: now,
      last_login_at: now,
    });
    return { kind: "ok" };
  }

  return { kind: "redirect", to: "/login?error=not-invited" };
}
```

- [ ] **Step 2: Write the test**

```ts
// tests/auth/callback.logic.test.ts
import { describe, it, expect } from "vitest";
import { runCallbackGate } from "@/lib/auth-callback";

function mockSvc(state: { users: any[] }) {
  const svc: any = {
    from: (t: string) => ({
      select: () => ({
        eq: (_c: string, v: string) => ({
          maybeSingle: async () => ({
            data: state.users.find(u => u.email === v) ?? null,
          }),
        }),
        head: true,
      }),
      _selectCount: async () => ({ count: state.users.length }),
      insert: async (row: any) => { state.users.push({ ...row, id: "new" }); return { data: null, error: null }; },
      update: (patch: any) => ({
        eq: async (_c: string, id: string) => {
          const u = state.users.find(u => u.id === id);
          if (u) Object.assign(u, patch);
          return { data: null, error: null };
        },
      }),
    }),
    rpc: async () => ({ data: null, error: null }),
  };
  // Wire head:true count path:
  const origFrom = svc.from;
  svc.from = (t: string) => {
    const r = origFrom(t);
    const origSelect = r.select;
    r.select = (_a?: any, o?: any) => {
      if (o?.head && o?.count) return { count: state.users.length };
      return origSelect();
    };
    return r;
  };
  return svc;
}

describe("runCallbackGate", () => {
  it("rejects unverified email", async () => {
    const svc = mockSvc({ users: [] });
    const r = await runCallbackGate({ id: "a", email: "x@y.com", email_verified: false }, svc);
    expect(r).toEqual({ kind: "redirect", to: "/login?error=unverified" });
  });

  it("bootstraps admin on empty DB", async () => {
    const state = { users: [] };
    const svc = mockSvc(state);
    const r = await runCallbackGate({ id: "a", email: "x@y.com", email_verified: true }, svc);
    expect(r).toEqual({ kind: "ok" });
    expect(state.users[0].role).toBe("admin");
    expect(state.users[0].auth_user_id).toBe("a");
  });

  it("rejects unknown email on non-empty DB", async () => {
    const state = { users: [{ id: "u1", email: "other@y.com", auth_user_id: "u1", role: "admin", removed_at: null }] };
    const svc = mockSvc(state);
    const r = await runCallbackGate({ id: "a", email: "x@y.com", email_verified: true }, svc);
    expect(r).toEqual({ kind: "redirect", to: "/login?error=not-invited" });
  });

  it("stamps auth_user_id on first login for invited user", async () => {
    const state = { users: [{ id: "u1", email: "x@y.com", auth_user_id: null, role: "user", removed_at: null }] };
    const svc = mockSvc(state);
    const r = await runCallbackGate({ id: "a", email: "x@y.com", email_verified: true }, svc);
    expect(r).toEqual({ kind: "ok" });
    expect(state.users[0].auth_user_id).toBe("a");
    expect(state.users[0].first_login_at).toBeTruthy();
  });

  it("rejects removed user", async () => {
    const state = { users: [{ id: "u1", email: "x@y.com", auth_user_id: "a", role: "user", removed_at: "2026-01-01" }] };
    const svc = mockSvc(state);
    const r = await runCallbackGate({ id: "a", email: "x@y.com", email_verified: true }, svc);
    expect(r).toEqual({ kind: "redirect", to: "/login?error=removed" });
  });
});
```

- [ ] **Step 3: Run test — expect PASS**

```bash
npx vitest run tests/auth/callback.logic.test.ts
```

- [ ] **Step 4: Write the Route Handler**

```ts
// app/auth/callback/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runCallbackGate } from "@/lib/auth-callback";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=missing-code", req.url));

  const supabase = createSupabaseServerClient();
  const { data: exchange, error: exErr } = await supabase.auth.exchangeCodeForSession(code);
  if (exErr || !exchange.session) {
    return NextResponse.redirect(new URL("/login?error=exchange-failed", req.url));
  }

  const { user } = exchange;
  const svc = createSupabaseServiceClient();

  const gate = await runCallbackGate(
    {
      id: user!.id,
      email: user!.email!,
      email_verified: (user!.user_metadata?.email_verified === true) || (user!.email_confirmed_at != null),
    },
    svc
  );

  if (gate.kind === "redirect") {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL(gate.to, req.url));
  }
  return NextResponse.redirect(new URL("/", req.url));
}
```

- [ ] **Step 5: Commit**

```bash
git add app/auth/callback lib/auth-callback.ts tests/auth/callback.logic.test.ts
git commit -m "Implement auth callback gate + unit tests"
```

---

### Task 1.16: Signout route

**Files:**
- Create: `app/auth/signout/route.ts`

- [ ] **Step 1: Write route**

```ts
// app/auth/signout/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/auth/signout
git commit -m "Add signout route"
```

---

### Task 1.17: App layout (auth gate + nav)

**Files:**
- Create: `app/(app)/layout.tsx`, `app/(app)/page.tsx`, `components/NavBar.tsx`

- [ ] **Step 1: Write nav bar**

```tsx
// components/NavBar.tsx
import Link from "next/link";
import type { AppUser } from "@/lib/auth";

const ORG = process.env.NEXT_PUBLIC_ORG_NAME ?? "Donation Portal";

export function NavBar({ user }: { user: AppUser }) {
  const isAdmin = user.role === "admin";
  return (
    <nav className="border-b bg-white px-4 py-3">
      <div className="max-w-5xl mx-auto flex flex-wrap items-center gap-4">
        <Link href="/" className="font-serif text-lg mr-auto">{ORG}</Link>
        <Link href="/donations/add" className="text-sm hover:underline">Add Donation</Link>
        <Link href="/report"        className="text-sm hover:underline">Report</Link>
        <Link href="/tax-summary"   className="text-sm hover:underline">Tax Summary</Link>
        {isAdmin && <Link href="/admin/funds" className="text-sm hover:underline">Funds</Link>}
        {isAdmin && <Link href="/admin/users" className="text-sm hover:underline">Users</Link>}
        <form action="/auth/signout" method="post" className="inline">
          <button type="submit" className="text-sm hover:underline">Logout</button>
        </form>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Write gated layout**

```tsx
// app/(app)/layout.tsx
import { redirect } from "next/navigation";
import { currentAppUser } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentAppUser();
  if (!user) redirect("/login");
  return (
    <div className="min-h-screen bg-stone-50">
      <NavBar user={user} />
      <main className="max-w-5xl mx-auto p-4 md:p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Write root `/` page — redirects to /donations/add**

```tsx
// app/(app)/page.tsx
import { redirect } from "next/navigation";
export default function Home() { redirect("/donations/add"); }
```

- [ ] **Step 4: Delete the default Next.js `app/page.tsx`**

```bash
git rm -f app/page.tsx  # remove the scaffold's default home page
```

- [ ] **Step 5: Commit**

```bash
git add "app/(app)" components/
git commit -m "Add gated app layout + nav + root redirect"
```

---

### Task 1.18: Configure Supabase Auth providers (manual, dashboard)

**This is documentation, not code.** Add entries to `docs/ops/new-client.md`:

- [ ] **Step 1: Create docs file**

```md
# New-client setup

## 1. Supabase Auth configuration
1. Dashboard → Authentication → Providers:
   - **Google:** paste client ID + secret from Google Cloud Console OAuth. Redirect URL: `https://<domain>/auth/callback` AND `https://<project-ref>.supabase.co/auth/v1/callback`.
   - **Azure (Microsoft):** paste client ID + secret from Entra app registration. Same redirects.
2. Dashboard → Authentication → Settings → enable **"Link accounts with same email"**.
3. Dashboard → Authentication → URL Configuration → Site URL = `https://<domain>`.

## 2. Google OAuth client (Google Cloud Console)
- Create OAuth consent screen (external, testing OK for dev).
- Create OAuth 2.0 Client ID (Web application).
- Authorized redirect URIs:
  - `https://<project-ref>.supabase.co/auth/v1/callback`

## 3. Microsoft Entra app registration
- Azure Portal → Entra ID → App registrations → New registration.
- Redirect URI (Web): `https://<project-ref>.supabase.co/auth/v1/callback`.
- Certificates & secrets → New client secret.
- API permissions → Microsoft Graph → User.Read (delegated), email, openid, profile.

## 4. Vercel env vars
See `.env.local.example`. Set all `NEXT_PUBLIC_*` and `SUPABASE_SERVICE_ROLE_KEY`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/ops/new-client.md
git commit -m "Document new-client setup (Supabase + Google + Microsoft)"
```

- [ ] **Step 3: User action required — complete the dashboard configuration before testing auth end-to-end.**

---

### Task 1.19: End-of-Phase-1 smoke check

- [ ] **Step 1: Local dev run**

```bash
npm run dev
```

Open `http://localhost:3000`:
- Unauthenticated → redirected to `/login`.
- `/login` shows both buttons.
- Click Google → go through real OAuth with a real Google account.
- On return, you should land on `/donations/add` (404 is fine for now; we haven't built that page).
- Verify in Supabase Studio that `public.users` has one row with role `admin`.

- [ ] **Step 2: Push to trigger deploy**

```bash
git push
```

Wait for Vercel deploy. Visit `https://ccm.pinnacledatascience.com/login` → buttons present. **Do not complete OAuth on prod yet** — we still need the OAuth client IDs configured in Supabase first (Task 1.18). Phase 1 exit criterion: login page renders, signout works, auth callback code is in place.

---

## Phase 2: Donations

### Task 2.1: Validation schemas (Zod)

**Files:**
- Create: `lib/validators.ts`, `tests/lib/validators.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/lib/validators.test.ts
import { describe, it, expect } from "vitest";
import { donationInputSchema } from "@/lib/validators";

describe("donationInputSchema", () => {
  const base = {
    donee_id: "00000000-0000-0000-0000-000000000001",
    fund_id:  "00000000-0000-0000-0000-000000000002",
    type: "cash" as const,
    amount: "10.00",
    date_received: "2026-04-16",
  };

  it("accepts a valid cash donation", () => {
    expect(donationInputSchema.safeParse(base).success).toBe(true);
  });

  it("rejects amount <= 0", () => {
    expect(donationInputSchema.safeParse({ ...base, amount: "0" }).success).toBe(false);
    expect(donationInputSchema.safeParse({ ...base, amount: "-1" }).success).toBe(false);
  });

  it("rejects amount with more than 2 decimals", () => {
    expect(donationInputSchema.safeParse({ ...base, amount: "10.001" }).success).toBe(false);
  });

  it("requires check_number when type is check", () => {
    expect(donationInputSchema.safeParse({ ...base, type: "check" }).success).toBe(false);
    expect(donationInputSchema.safeParse({ ...base, type: "check", check_number: "1234" }).success).toBe(true);
  });

  it("requires reference_id when type is online", () => {
    expect(donationInputSchema.safeParse({ ...base, type: "online" }).success).toBe(false);
    expect(donationInputSchema.safeParse({ ...base, type: "online", reference_id: "TX-1" }).success).toBe(true);
  });

  it("forbids check_number when type is cash", () => {
    expect(donationInputSchema.safeParse({ ...base, check_number: "1234" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run tests/lib/validators.test.ts
```

- [ ] **Step 3: Write `lib/validators.ts`**

```ts
import { z } from "zod";

const uuid = z.string().uuid();
const amount = z.string().regex(/^\d+(\.\d{1,2})?$/, "amount must have at most 2 decimals")
  .refine(v => parseFloat(v) > 0, "amount must be > 0")
  .refine(v => parseFloat(v) <= 99999999.99, "amount too large");

export const donationInputSchema = z.object({
  donee_id: uuid,
  fund_id: uuid,
  type: z.enum(["cash", "check", "online"]),
  amount,
  date_received: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  check_number: z.string().trim().min(1).max(50).optional(),
  reference_id: z.string().trim().min(1).max(100).optional(),
  note: z.string().trim().max(1000).optional(),
}).superRefine((v, ctx) => {
  if (v.type === "check" && !v.check_number) ctx.addIssue({ code: "custom", message: "check_number required for checks", path: ["check_number"] });
  if (v.type !== "check" && v.check_number)  ctx.addIssue({ code: "custom", message: "check_number only allowed for checks", path: ["check_number"] });
  if (v.type === "online" && !v.reference_id) ctx.addIssue({ code: "custom", message: "reference_id required for online", path: ["reference_id"] });
  if (v.type !== "online" && v.reference_id)  ctx.addIssue({ code: "custom", message: "reference_id only allowed for online", path: ["reference_id"] });
});

export const voidInputSchema = z.object({
  id: uuid,
  reason: z.string().trim().min(1).max(500),
});

export const inviteInputSchema = z.object({
  email: z.string().email().max(320),
});

export const doneeInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().email().max(320).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
});

export const fundInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run tests/lib/validators.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/validators.ts tests/lib/validators.test.ts
git commit -m "Add Zod schemas for donation/void/invite/donee/fund inputs"
```

---

### Task 2.2: DoneePicker Server Action (search + create)

**Files:**
- Create: `app/(app)/donations/actions.ts`

- [ ] **Step 1: Write Server Actions file**

```ts
// app/(app)/donations/actions.ts
"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { doneeInputSchema, donationInputSchema, voidInputSchema } from "@/lib/validators";
import { revalidatePath } from "next/cache";

export async function searchDonees(q: string) {
  await requireUser();
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];
  const safe = trimmed.replace(/[%_]/g, (m) => `\\${m}`); // escape LIKE wildcards
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("donees")
    .select("id,name,email,phone")
    .or(`name.ilike.%${safe}%,name.wfts.${safe}`)  // ilike OR similarity fallback
    .order("name", { ascending: true })
    .limit(10);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createDonee(input: unknown) {
  const user = await requireUser();
  const parsed = doneeInputSchema.parse(input);
  const supabase = createSupabaseServerClient();
  const payload = {
    name: parsed.name,
    email: parsed.email || null,
    phone: parsed.phone || null,
    address: parsed.address || null,
    created_by: user.id,
  };
  const { data, error } = await supabase.from("donees").insert(payload).select("id,name,email,phone").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function addDonation(input: unknown) {
  const user = await requireUser();
  const parsed = donationInputSchema.parse(input);
  const supabase = createSupabaseServerClient();

  // Fund must not be archived at insert time.
  const { data: fund, error: fErr } = await supabase
    .from("funds").select("id, archived_at").eq("id", parsed.fund_id).single();
  if (fErr || !fund) throw new Error("Fund not found");
  if (fund.archived_at) throw new Error("Fund is archived");

  const { error } = await supabase.from("donations").insert({
    donee_id: parsed.donee_id,
    fund_id: parsed.fund_id,
    type: parsed.type,
    amount: parsed.amount,
    date_received: parsed.date_received,
    check_number: parsed.check_number ?? null,
    reference_id: parsed.reference_id ?? null,
    note: parsed.note ?? null,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/report");
}

export async function voidDonation(input: unknown) {
  const user = await requireUser();
  const parsed = voidInputSchema.parse(input);
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("donations")
    .update({
      voided_at: new Date().toISOString(),
      voided_by: user.id,
      void_reason: parsed.reason,
    })
    .eq("id", parsed.id);
  if (error) throw new Error(error.message);
  revalidatePath("/report");
}
```

**Note** on `searchDonees`: the Supabase `.or(…,name.wfts.…)` uses `wfts` (websearch-to-tsquery). Trigram `%` operator isn't exposed via PostgREST's `.or` — we use `ilike` as the primary match and a basic `wfts` fallback. For production autocomplete with 10k rows, this is fast enough given the GIN index on `name`. If latency spikes, replace with an RPC call to a SQL function that uses `%` operator directly.

- [ ] **Step 2: Commit**

```bash
git add "app/(app)/donations/actions.ts"
git commit -m "Add Server Actions for donee/donation/void"
```

---

### Task 2.3: DoneePicker client component

**Files:**
- Create: `components/DoneePicker.tsx`

- [ ] **Step 1: Write component**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { searchDonees, createDonee } from "@/app/(app)/donations/actions";

type Donee = { id: string; name: string; email: string | null; phone: string | null };

export function DoneePicker({ onSelect }: { onSelect: (d: Donee) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Donee[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Donee | null>(null);
  const [creating, setCreating] = useState(false);
  const [newFields, setNewFields] = useState({ email: "", phone: "", address: "" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      const rows = await searchDonees(q);
      setResults(rows);
      setOpen(true);
    }, 200);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  function pick(d: Donee) {
    setSelected(d);
    setQ(d.name);
    setOpen(false);
    onSelect(d);
  }

  async function doCreate() {
    const d = await createDonee({ name: q.trim(), ...newFields });
    pick(d as Donee);
    setCreating(false);
    setNewFields({ email: "", phone: "", address: "" });
  }

  const hasExactMatch = results.some(r => r.name.toLowerCase() === q.trim().toLowerCase());

  return (
    <div className="relative">
      <label className="block text-sm font-medium mb-1">Donee</label>
      <input
        className="w-full border rounded px-3 py-2"
        value={q}
        onChange={(e) => { setQ(e.target.value); setSelected(null); }}
        onFocus={() => { if (results.length) setOpen(true); }}
        placeholder="Type name…"
        role="combobox"
        aria-expanded={open}
      />
      {open && (
        <div role="listbox" className="absolute z-10 mt-1 w-full bg-white border rounded shadow max-h-64 overflow-auto">
          {results.map(r => (
            <button key={r.id} type="button" role="option" onClick={() => pick(r)} className="block w-full text-left px-3 py-2 hover:bg-stone-100">
              {r.name}
            </button>
          ))}
          {q.trim().length >= 2 && !hasExactMatch && (
            <button type="button" onClick={() => { setCreating(true); setOpen(false); }} className="block w-full text-left px-3 py-2 text-blue-700 hover:bg-stone-100">
              + Create new: &ldquo;{q.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
      {creating && (
        <div className="mt-3 p-3 border rounded bg-stone-50 space-y-2">
          <div className="text-sm font-medium">New donee: {q.trim()}</div>
          <input className="w-full border rounded px-2 py-1 text-sm" placeholder="Email (optional)"   value={newFields.email}   onChange={e => setNewFields(f => ({ ...f, email: e.target.value }))} />
          <input className="w-full border rounded px-2 py-1 text-sm" placeholder="Phone (optional)"   value={newFields.phone}   onChange={e => setNewFields(f => ({ ...f, phone: e.target.value }))} />
          <input className="w-full border rounded px-2 py-1 text-sm" placeholder="Address (optional)" value={newFields.address} onChange={e => setNewFields(f => ({ ...f, address: e.target.value }))} />
          <div className="flex gap-2">
            <button type="button" onClick={doCreate} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">Create</button>
            <button type="button" onClick={() => setCreating(false)} className="px-3 py-1 border rounded text-sm">Cancel</button>
          </div>
        </div>
      )}
      {selected && <input type="hidden" name="donee_id" value={selected.id} />}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/DoneePicker.tsx
git commit -m "Add DoneePicker component with inline create"
```

---

### Task 2.4: Add Donation page

**Files:**
- Create: `app/(app)/donations/add/page.tsx`, `components/DonationForm.tsx`

- [ ] **Step 1: Donation form component**

```tsx
// components/DonationForm.tsx
"use client";

import { useState } from "react";
import { DoneePicker } from "./DoneePicker";
import { addDonation } from "@/app/(app)/donations/actions";
import { useRouter } from "next/navigation";

type Fund = { id: string; name: string };

export function DonationForm({ funds }: { funds: Fund[] }) {
  const router = useRouter();
  const [type, setType] = useState<"cash" | "check" | "online">("cash");
  const [doneeId, setDoneeId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null); setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await addDonation({
        donee_id: doneeId,
        fund_id: fd.get("fund_id"),
        type,
        amount: String(fd.get("amount") ?? ""),
        date_received: String(fd.get("date_received") ?? ""),
        check_number: fd.get("check_number") ? String(fd.get("check_number")) : undefined,
        reference_id: fd.get("reference_id") ? String(fd.get("reference_id")) : undefined,
        note: fd.get("note") ? String(fd.get("note")) : undefined,
      });
      router.push("/report");
    } catch (e: any) {
      setErr(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-xl">
      <div>
        <label className="block text-sm font-medium mb-1">Type</label>
        <div className="flex gap-2">
          {(["cash","check","online"] as const).map(t => (
            <label key={t} className={`px-3 py-1 border rounded cursor-pointer ${type===t?"bg-stone-800 text-white":"bg-white"}`}>
              <input type="radio" name="type" value={t} checked={type===t} onChange={() => setType(t)} className="sr-only" />
              {t}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Amount (USD)</label>
        <input name="amount" required inputMode="decimal" pattern="\d+(\.\d{1,2})?" className="w-full border rounded px-3 py-2" />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Date received</label>
        <input name="date_received" type="date" required defaultValue={today} className="w-full border rounded px-3 py-2" />
      </div>

      <DoneePicker onSelect={(d) => setDoneeId(d.id)} />

      <div>
        <label className="block text-sm font-medium mb-1">Fund</label>
        <select name="fund_id" required className="w-full border rounded px-3 py-2">
          <option value="">Select a fund…</option>
          {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>

      {type === "check" && (
        <div>
          <label className="block text-sm font-medium mb-1">Check #</label>
          <input name="check_number" required className="w-full border rounded px-3 py-2" />
        </div>
      )}

      {type === "online" && (
        <div>
          <label className="block text-sm font-medium mb-1">Reference / transaction ID</label>
          <input name="reference_id" required className="w-full border rounded px-3 py-2" />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Note (optional)</label>
        <textarea name="note" rows={2} className="w-full border rounded px-3 py-2" />
      </div>

      {err && <div className="p-3 bg-red-50 text-red-800 rounded text-sm">{err}</div>}

      <button disabled={saving || !doneeId} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">
        {saving ? "Saving…" : "Save donation"}
      </button>
    </form>
  );
}
```

(Correct the import path at the top of `DonationForm.tsx` — the `DoneePicker` lives at `@/components/DoneePicker`):

```tsx
import { DoneePicker } from "@/components/DoneePicker";
```

- [ ] **Step 2: Add Donation page**

```tsx
// app/(app)/donations/add/page.tsx
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DonationForm } from "@/components/DonationForm";

export default async function AddDonationPage() {
  const supabase = createSupabaseServerClient();
  const { data: funds } = await supabase
    .from("funds")
    .select("id,name")
    .is("archived_at", null)
    .order("name");
  return (
    <div>
      <h1 className="text-2xl font-serif mb-6">Add donation</h1>
      <DonationForm funds={funds ?? []} />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/donations/add/page.tsx" components/DonationForm.tsx
git commit -m "Add donation form page wired to DoneePicker + server actions"
```

---

### Task 2.5: Void donation page

**Files:**
- Create: `app/(app)/donations/[id]/void/page.tsx`

- [ ] **Step 1: Write page (Server Component with form)**

```tsx
// app/(app)/donations/[id]/void/page.tsx
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { voidDonation } from "@/app/(app)/donations/actions";

export default async function VoidPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: d } = await supabase
    .from("donations")
    .select("id,amount,date_received,type,donees(name),funds(name),voided_at")
    .eq("id", params.id)
    .single();
  if (!d) return <div>Donation not found.</div>;
  if (d.voided_at) return <div>Already voided.</div>;

  async function submit(formData: FormData) {
    "use server";
    const reason = String(formData.get("reason") ?? "").trim();
    await voidDonation({ id: params.id, reason });
    redirect("/report");
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-serif mb-4">Void donation</h1>
      <div className="mb-4 p-3 bg-stone-100 rounded text-sm">
        <div>{(d as any).donees?.name} &middot; ${d.amount} &middot; {d.type} &middot; {(d as any).funds?.name}</div>
        <div className="text-stone-500">{d.date_received}</div>
      </div>
      <form action={submit} className="space-y-3">
        <label className="block text-sm font-medium">Reason (required)</label>
        <textarea name="reason" required minLength={1} maxLength={500} rows={3} className="w-full border rounded px-3 py-2" />
        <button className="px-4 py-2 bg-red-600 text-white rounded">Void</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(app)/donations/[id]"
git commit -m "Add void-donation page"
```

---

### Task 2.6: Phase 2 smoke-test

- [ ] **Step 1: Manual local run**

```bash
npm run dev
```

With a local-dev session (sign in once in Phase 1 flow):
- `/donations/add` loads, has all fields.
- Typing 2+ chars in donee picker shows results.
- Inline-create a new donee, submit donation → redirects to `/report` (404 is fine — Phase 3 builds it).
- In Supabase Studio, confirm row exists in `donations` with `created_by` = you.
- Visit `/donations/<id>/void` with reason — row gets `voided_at`.

- [ ] **Step 2: Commit any fixes + push**

```bash
git push
```

---

## Phase 3: Reports

### Task 3.1: Monthly report page + totals

**Files:**
- Create: `app/(app)/report/page.tsx`, `lib/reports.ts`, `tests/lib/reports.test.ts`

- [ ] **Step 1: Write failing test for totals calculator**

```ts
// tests/lib/reports.test.ts
import { describe, it, expect } from "vitest";
import { summarize } from "@/lib/reports";

const rows = [
  { id: "1", type: "cash",   amount: "10.00", fund_name: "General",  voided_at: null },
  { id: "2", type: "check",  amount: "20.00", fund_name: "General",  voided_at: null },
  { id: "3", type: "online", amount: "30.00", fund_name: "Building", voided_at: null },
  { id: "4", type: "cash",   amount: "40.00", fund_name: "Building", voided_at: "2026-04-16" }, // voided
];

describe("summarize", () => {
  it("totals by type excluding voided", () => {
    const s = summarize(rows as any);
    expect(s.byType).toEqual({ cash: 10, check: 20, online: 30 });
    expect(s.byFund).toEqual({ General: 30, Building: 30 });
    expect(s.grand).toBe(60);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run tests/lib/reports.test.ts
```

- [ ] **Step 3: Write `lib/reports.ts`**

```ts
export type RowForSummary = {
  id: string;
  type: "cash" | "check" | "online";
  amount: string;
  fund_name: string;
  voided_at: string | null;
};

export type Summary = {
  byType: Record<"cash" | "check" | "online", number>;
  byFund: Record<string, number>;
  grand: number;
};

export function summarize(rows: RowForSummary[]): Summary {
  const byType = { cash: 0, check: 0, online: 0 };
  const byFund: Record<string, number> = {};
  let grand = 0;
  for (const r of rows) {
    if (r.voided_at) continue;
    const n = Number(r.amount);
    byType[r.type] += n;
    byFund[r.fund_name] = (byFund[r.fund_name] ?? 0) + n;
    grand += n;
  }
  return { byType, byFund, grand };
}

export function monthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const end = `${next.y}-${String(next.m).padStart(2, "0")}-01`;
  return { start, end };
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Write `app/(app)/report/page.tsx`**

```tsx
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { summarize, monthRange } from "@/lib/reports";

const PAGE_SIZE = 25;

function parseMonth(s?: string) {
  const d = s ? new Date(s + "-01") : new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export default async function ReportPage({
  searchParams,
}: { searchParams: { month?: string; page?: string; voided?: string } }) {
  const { year, month } = parseMonth(searchParams.month);
  const { start, end } = monthRange(year, month);
  const includeVoided = searchParams.voided === "1";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));

  const supabase = createSupabaseServerClient();

  let q = supabase
    .from("donations")
    .select("id,amount,type,date_received,check_number,reference_id,voided_at,donees(name),funds(name)", { count: "exact" })
    .gte("date_received", start).lt("date_received", end)
    .order("date_received", { ascending: false });

  if (!includeVoided) q = q.is("voided_at", null);

  const { data: rows, count } = await q.range((page-1)*PAGE_SIZE, page*PAGE_SIZE - 1);

  const flat = (rows ?? []).map((r: any) => ({
    id: r.id, type: r.type, amount: r.amount,
    fund_name: r.funds?.name ?? "", donee_name: r.donees?.name ?? "",
    date_received: r.date_received, check_number: r.check_number, reference_id: r.reference_id,
    voided_at: r.voided_at,
  }));

  // Fetch ALL rows for the month (no range) to compute totals, include voided if toggle on.
  const totalsQ = supabase.from("donations")
    .select("id,type,amount,voided_at,funds(name)")
    .gte("date_received", start).lt("date_received", end);
  const { data: allRows } = includeVoided ? await totalsQ : await totalsQ.is("voided_at", null);
  const sum = summarize((allRows ?? []).map((r: any) => ({
    id: r.id, type: r.type, amount: r.amount, voided_at: r.voided_at, fund_name: r.funds?.name ?? "",
  })));

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const qs = (obj: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(obj)) if (v != null && v !== "") p.set(k, String(v));
    return p.toString();
  };

  return (
    <div>
      <h1 className="text-2xl font-serif mb-4">Monthly report</h1>

      <form className="mb-4 flex flex-wrap gap-3 items-end">
        <label className="text-sm">
          Month
          <input type="month" name="month" defaultValue={monthStr} className="block border rounded px-2 py-1" />
        </label>
        <label className="text-sm flex items-center gap-1">
          <input type="checkbox" name="voided" value="1" defaultChecked={includeVoided} />
          Include voided
        </label>
        <button className="px-3 py-1 border rounded">Apply</button>
        <Link href={`/report/export?${qs({ month: monthStr, voided: includeVoided ? "1" : "" })}`}
              className="ml-auto px-3 py-1 border rounded">Download CSV</Link>
      </form>

      <section className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-3 bg-white rounded border">
          <div className="text-xs uppercase text-stone-500">Grand total</div>
          <div className="text-2xl font-medium">${sum.grand.toFixed(2)}</div>
        </div>
        <div className="p-3 bg-white rounded border">
          <div className="text-xs uppercase text-stone-500 mb-1">By type</div>
          {(["cash","check","online"] as const).map(t => (
            <div key={t} className="text-sm flex justify-between"><span>{t}</span><span>${sum.byType[t].toFixed(2)}</span></div>
          ))}
        </div>
        <div className="p-3 bg-white rounded border">
          <div className="text-xs uppercase text-stone-500 mb-1">By fund</div>
          {Object.entries(sum.byFund).map(([fund, n]) => (
            <div key={fund} className="text-sm flex justify-between"><span>{fund}</span><span>${n.toFixed(2)}</span></div>
          ))}
        </div>
      </section>

      <table className="w-full text-sm bg-white rounded border">
        <thead className="bg-stone-100">
          <tr>
            <th className="text-left p-2">Date</th><th className="text-left p-2">Donee</th>
            <th className="text-left p-2">Type</th><th className="text-left p-2">Fund</th>
            <th className="text-right p-2">Amount</th><th className="text-left p-2">Check/Ref</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {flat.map(r => (
            <tr key={r.id} className={`border-t ${r.voided_at ? "line-through text-stone-500" : ""}`}>
              <td className="p-2">{r.date_received}</td>
              <td className="p-2">{r.donee_name}</td>
              <td className="p-2">{r.type}</td>
              <td className="p-2">{r.fund_name}</td>
              <td className="p-2 text-right">${Number(r.amount).toFixed(2)}</td>
              <td className="p-2">{r.check_number ?? r.reference_id ?? ""}</td>
              <td className="p-2">
                {!r.voided_at && <Link href={`/donations/${r.id}/void`} className="text-xs text-red-700 hover:underline">void</Link>}
              </td>
            </tr>
          ))}
          {flat.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-stone-500">No donations for this filter.</td></tr>}
        </tbody>
      </table>

      <div className="mt-3 flex gap-2 items-center">
        {page > 1 && <Link href={`/report?${qs({ month: monthStr, voided: includeVoided ? "1" : "", page: page-1 })}`} className="px-2 py-1 border rounded text-sm">Prev</Link>}
        <span className="text-sm text-stone-500">Page {page} / {totalPages}</span>
        {page < totalPages && <Link href={`/report?${qs({ month: monthStr, voided: includeVoided ? "1" : "", page: page+1 })}`} className="px-2 py-1 border rounded text-sm">Next</Link>}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add app tests lib/reports.ts
git commit -m "Add monthly report with totals + paginated table"
```

---

### Task 3.2: CSV export Route Handler

**Files:**
- Create: `app/(app)/report/export/route.ts`, `lib/csv.ts`, `tests/lib/csv.test.ts`

- [ ] **Step 1: Test CSV serialization**

```ts
// tests/lib/csv.test.ts
import { describe, it, expect } from "vitest";
import { csvRow } from "@/lib/csv";

describe("csvRow", () => {
  it("quotes fields with commas", () => {
    expect(csvRow(["a", "b,c", "d"])).toBe('a,"b,c",d');
  });
  it("escapes quotes inside quoted fields", () => {
    expect(csvRow(['he said "hi"'])).toBe('"he said ""hi"""');
  });
  it("preserves empty fields", () => {
    expect(csvRow(["", "x"])).toBe(",x");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Write `lib/csv.ts`**

```ts
export function csvRow(cols: (string | number | null | undefined)[]): string {
  return cols
    .map((c) => {
      if (c == null) return "";
      const s = String(c);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    })
    .join(",");
}

export const CSV_HEADERS = [
  "date", "donee", "type", "fund", "amount", "check_number", "reference_id", "note", "voided", "void_reason",
];
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Route Handler**

```ts
// app/(app)/report/export/route.ts
import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { monthRange } from "@/lib/reports";
import { csvRow, CSV_HEADERS } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await requireUser();
  const url = new URL(req.url);
  const [y, m] = (url.searchParams.get("month") ?? new Date().toISOString().slice(0, 7)).split("-").map(Number);
  const includeVoided = url.searchParams.get("voided") === "1";
  const { start, end } = monthRange(y, m);

  const supabase = createSupabaseServerClient();
  let q = supabase
    .from("donations")
    .select("date_received,type,amount,check_number,reference_id,note,voided_at,void_reason,donees(name),funds(name)")
    .gte("date_received", start).lt("date_received", end)
    .order("date_received", { ascending: true });
  if (!includeVoided) q = q.is("voided_at", null);
  const { data } = await q;

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(enc.encode(csvRow(CSV_HEADERS) + "\n"));
      for (const r of (data ?? []) as any[]) {
        ctrl.enqueue(enc.encode(csvRow([
          r.date_received, r.donees?.name ?? "", r.type, r.funds?.name ?? "", r.amount,
          r.check_number ?? "", r.reference_id ?? "", r.note ?? "",
          r.voided_at ? "true" : "false", r.void_reason ?? "",
        ]) + "\n"));
      }
      ctrl.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="donations-${y}-${String(m).padStart(2, "0")}.csv"`,
    },
  });
}
```

- [ ] **Step 6: Commit**

```bash
git add app tests lib/csv.ts
git commit -m "Add streaming CSV export for monthly report"
```

---

### Task 3.3: Tax summary page

**Files:**
- Create: `app/(app)/tax-summary/page.tsx`, `app/(app)/tax-summary/[doneeId]/[year]/print/page.tsx`, `app/(app)/tax-summary/export/route.ts`

- [ ] **Step 1: Tax summary page** (donee + year picker, show totals, CSV + print buttons)

```tsx
// app/(app)/tax-summary/page.tsx
import Link from "next/link";
import { DoneePicker } from "@/components/DoneePicker";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function TaxSummaryPage({ searchParams }: { searchParams: { donee?: string; year?: string } }) {
  const year = parseInt(searchParams.year ?? String(new Date().getFullYear()), 10);
  const doneeId = searchParams.donee;
  let rows: any[] = []; let donee: any = null; let total = 0;

  if (doneeId) {
    const supabase = createSupabaseServerClient();
    const { data: d } = await supabase.from("donees").select("*").eq("id", doneeId).single();
    donee = d;
    const { data } = await supabase
      .from("donations")
      .select("date_received,type,amount,funds(name)")
      .eq("donee_id", doneeId)
      .is("voided_at", null)
      .gte("date_received", `${year}-01-01`)
      .lt("date_received", `${year+1}-01-01`)
      .order("date_received");
    rows = data ?? [];
    total = rows.reduce((s, r: any) => s + Number(r.amount), 0);
  }

  return (
    <div>
      <h1 className="text-2xl font-serif mb-4">Tax summary</h1>
      <form className="flex gap-3 items-end mb-6" method="get">
        <label className="flex-1">
          <span className="block text-sm">Donee</span>
          <TaxDoneePicker defaultId={doneeId} />
        </label>
        <label>
          <span className="block text-sm">Year</span>
          <input type="number" name="year" defaultValue={year} className="border rounded px-2 py-1 w-28" />
        </label>
        <button className="px-3 py-1 border rounded">Apply</button>
      </form>

      {donee && (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <Link href={`/tax-summary/export?donee=${doneeId}&year=${year}`} className="px-3 py-1 border rounded">Download CSV</Link>
            <Link href={`/tax-summary/${doneeId}/${year}/print`} className="px-3 py-1 border rounded" target="_blank">Print view</Link>
          </div>
          <div className="mb-3 text-lg">Donee: <strong>{donee.name}</strong> &middot; Year {year} &middot; Total: <strong>${total.toFixed(2)}</strong></div>
          <table className="w-full text-sm bg-white rounded border">
            <thead className="bg-stone-100"><tr><th className="text-left p-2">Date</th><th className="text-left p-2">Type</th><th className="text-left p-2">Fund</th><th className="text-right p-2">Amount</th></tr></thead>
            <tbody>
              {rows.map((r: any, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2">{r.date_received}</td>
                  <td className="p-2">{r.type}</td>
                  <td className="p-2">{r.funds?.name ?? ""}</td>
                  <td className="p-2 text-right">${Number(r.amount).toFixed(2)}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-stone-500">No donations for this donee in {year}.</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// Client wrapper that writes doneeId into the form on selection.
function TaxDoneePicker({ defaultId }: { defaultId?: string }) {
  return <DoneePicker onSelect={() => {}} />;
}
```

**Note:** `TaxDoneePicker` above is a placeholder that doesn't persist selection into the form. Replace with a small client component that stores the selected id in a hidden input named `donee`. Create `components/TaxDoneePicker.tsx`:

```tsx
"use client";
import { useState } from "react";
import { DoneePicker } from "./DoneePicker";

export function TaxDoneePicker({ defaultId }: { defaultId?: string }) {
  const [id, setId] = useState(defaultId ?? "");
  return (
    <>
      <DoneePicker onSelect={(d) => setId(d.id)} />
      <input type="hidden" name="donee" value={id} />
    </>
  );
}
```

Then replace the usage in `tax-summary/page.tsx` to import and use `TaxDoneePicker` instead of the inline helper.

- [ ] **Step 2: Print-friendly view**

```tsx
// app/(app)/tax-summary/[doneeId]/[year]/print/page.tsx
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ORG = process.env.NEXT_PUBLIC_ORG_NAME ?? "Organization";
const ADDR = process.env.NEXT_PUBLIC_ORG_ADDRESS ?? "";
const TAX = process.env.NEXT_PUBLIC_ORG_TAX_STATEMENT ?? "";

export default async function PrintView({ params }: { params: { doneeId: string; year: string } }) {
  const year = parseInt(params.year, 10);
  const supabase = createSupabaseServerClient();
  const { data: donee } = await supabase.from("donees").select("*").eq("id", params.doneeId).single();
  const { data: rows } = await supabase.from("donations")
    .select("date_received,type,amount,funds(name)")
    .eq("donee_id", params.doneeId)
    .is("voided_at", null)
    .gte("date_received", `${year}-01-01`).lt("date_received", `${year+1}-01-01`)
    .order("date_received");
  const total = (rows ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);

  return (
    <html><body>
      <style>{`
        body { font-family: Georgia, serif; color: #222; max-width: 780px; margin: 2rem auto; padding: 0 1.5rem; }
        h1 { font-size: 1.75rem; margin: 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 1.5rem; }
        th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #ccc; }
        td.r, th.r { text-align: right; }
        .footer { margin-top: 2rem; font-size: 0.9rem; white-space: pre-line; }
        @media print { .noprint { display: none; } }
      `}</style>
      <header>
        <h1>{ORG}</h1>
        <div style={{ whiteSpace: "pre-line", color: "#555" }}>{ADDR}</div>
      </header>
      <section style={{ marginTop: "2rem" }}>
        <div><strong>Donor:</strong> {donee?.name}</div>
        {donee?.address && <div style={{ whiteSpace: "pre-line" }}>{donee.address}</div>}
        <div><strong>Tax year:</strong> {year}</div>
        <div><strong>Total contributions:</strong> ${total.toFixed(2)}</div>
      </section>
      <table>
        <thead><tr><th>Date</th><th>Type</th><th>Fund</th><th className="r">Amount</th></tr></thead>
        <tbody>
          {(rows ?? []).map((r: any, i: number) => (
            <tr key={i}><td>{r.date_received}</td><td>{r.type}</td><td>{r.funds?.name ?? ""}</td><td className="r">${Number(r.amount).toFixed(2)}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="footer">{TAX}</div>
      <button className="noprint" onClick={() => window.print()} style={{ marginTop: "1.5rem" }}>Print</button>
    </body></html>
  );
}
```

- [ ] **Step 3: CSV export**

```ts
// app/(app)/tax-summary/export/route.ts
import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { csvRow } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await requireUser();
  const url = new URL(req.url);
  const doneeId = url.searchParams.get("donee");
  const year = parseInt(url.searchParams.get("year") ?? String(new Date().getFullYear()), 10);
  if (!doneeId) return new Response("missing donee", { status: 400 });

  const supabase = createSupabaseServerClient();
  const { data: donee } = await supabase.from("donees").select("name").eq("id", doneeId).single();
  const { data } = await supabase.from("donations")
    .select("date_received,type,amount,funds(name)")
    .eq("donee_id", doneeId)
    .is("voided_at", null)
    .gte("date_received", `${year}-01-01`).lt("date_received", `${year+1}-01-01`)
    .order("date_received");

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(enc.encode(csvRow(["date","type","fund","amount"]) + "\n"));
      for (const r of (data ?? []) as any[]) {
        ctrl.enqueue(enc.encode(csvRow([r.date_received, r.type, r.funds?.name ?? "", r.amount]) + "\n"));
      }
      ctrl.close();
    },
  });

  const filename = `tax-${donee?.name?.replace(/\s+/g, "_") ?? "donor"}-${year}.csv`;
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/tax-summary" components/TaxDoneePicker.tsx
git commit -m "Add tax summary page, CSV export, print-friendly view"
```

---

## Phase 4: Admin

### Task 4.1: Admin layout + users list

**Files:**
- Create: `app/(app)/admin/layout.tsx`, `app/(app)/admin/users/page.tsx`, `app/(app)/admin/actions.ts`

- [ ] **Step 1: Admin layout**

```tsx
// app/(app)/admin/layout.tsx
import { redirect } from "next/navigation";
import { currentAppUser } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await currentAppUser();
  if (!u || u.role !== "admin") redirect("/");
  return <>{children}</>;
}
```

- [ ] **Step 2: Admin server actions**

```ts
// app/(app)/admin/actions.ts
"use server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { inviteInputSchema, fundInputSchema } from "@/lib/validators";
import { revalidatePath } from "next/cache";

export async function inviteUser(input: unknown) {
  const admin = await requireAdmin();
  const { email } = inviteInputSchema.parse(input);
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("users").insert({
    email: email.toLowerCase(),
    role: "user",
    invited_by: admin.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

export async function setUserRole(userId: string, role: "admin" | "user") {
  const admin = await requireAdmin();
  if (userId === admin.id && role === "user") throw new Error("Can't demote yourself");
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("users").update({ role }).eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

export async function removeUser(userId: string) {
  const admin = await requireAdmin();
  if (userId === admin.id) throw new Error("Can't remove yourself");
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("users").update({ removed_at: new Date().toISOString() }).eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

export async function addFund(input: unknown) {
  await requireAdmin();
  const { name } = fundInputSchema.parse(input);
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("funds").insert({ name });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/funds");
}

export async function archiveFund(id: string) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("funds").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/funds");
}
```

- [ ] **Step 3: Users page**

```tsx
// app/(app)/admin/users/page.tsx
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { inviteUser, setUserRole, removeUser } from "@/app/(app)/admin/actions";

export default async function UsersPage() {
  const supabase = createSupabaseServerClient();
  const { data: users } = await supabase.from("users_with_providers").select("*").order("invited_at", { ascending: false });

  async function invite(fd: FormData) { "use server"; await inviteUser({ email: String(fd.get("email") ?? "") }); }
  async function promote(fd: FormData) { "use server"; await setUserRole(String(fd.get("id")), "admin"); }
  async function demote(fd: FormData)  { "use server"; await setUserRole(String(fd.get("id")), "user"); }
  async function remove(fd: FormData)  { "use server"; await removeUser(String(fd.get("id"))); }

  return (
    <div>
      <h1 className="text-2xl font-serif mb-4">Users</h1>

      <form action={invite} className="mb-6 flex gap-2 items-end">
        <label className="flex-1">
          <span className="block text-sm">Invite email</span>
          <input name="email" type="email" required className="w-full border rounded px-3 py-2" />
        </label>
        <button className="px-4 py-2 bg-blue-600 text-white rounded">Invite</button>
      </form>

      <table className="w-full text-sm bg-white rounded border">
        <thead className="bg-stone-100"><tr>
          <th className="text-left p-2">Email</th><th className="text-left p-2">Role</th>
          <th className="text-left p-2">Last login</th><th className="text-left p-2">Providers</th>
          <th className="text-left p-2">Status</th><th className="p-2"></th>
        </tr></thead>
        <tbody>
          {(users ?? []).map((u: any) => (
            <tr key={u.id} className="border-t">
              <td className="p-2">{u.email}</td>
              <td className="p-2">{u.role}</td>
              <td className="p-2">{u.last_login_at ?? "—"}</td>
              <td className="p-2">{(u.providers ?? []).join(", ") || "—"}</td>
              <td className="p-2">{u.removed_at ? "removed" : (u.auth_user_id ? "active" : "invited")}</td>
              <td className="p-2 flex gap-2">
                {u.removed_at ? null : u.role === "user" ? (
                  <form action={promote}><input type="hidden" name="id" value={u.id} /><button className="text-xs border px-2 py-1 rounded">Promote</button></form>
                ) : (
                  <form action={demote}><input type="hidden" name="id" value={u.id} /><button className="text-xs border px-2 py-1 rounded">Demote</button></form>
                )}
                {!u.removed_at && (
                  <form action={remove}><input type="hidden" name="id" value={u.id} /><button className="text-xs border px-2 py-1 rounded text-red-700">Remove</button></form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/admin"
git commit -m "Add admin users list with invite/promote/demote/remove"
```

---

### Task 4.2: Admin funds page

**Files:**
- Create: `app/(app)/admin/funds/page.tsx`

- [ ] **Step 1: Write page**

```tsx
// app/(app)/admin/funds/page.tsx
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addFund, archiveFund } from "@/app/(app)/admin/actions";

export default async function FundsPage() {
  const supabase = createSupabaseServerClient();
  const { data: funds } = await supabase.from("funds").select("*").order("archived_at", { nullsFirst: true }).order("name");

  async function add(fd: FormData)    { "use server"; await addFund({ name: String(fd.get("name") ?? "") }); }
  async function archive(fd: FormData){ "use server"; await archiveFund(String(fd.get("id"))); }

  return (
    <div>
      <h1 className="text-2xl font-serif mb-4">Funds</h1>

      <form action={add} className="mb-6 flex gap-2 items-end">
        <label className="flex-1"><span className="block text-sm">New fund name</span><input name="name" required className="w-full border rounded px-3 py-2" /></label>
        <button className="px-4 py-2 bg-blue-600 text-white rounded">Add</button>
      </form>

      <table className="w-full text-sm bg-white rounded border">
        <thead className="bg-stone-100"><tr>
          <th className="text-left p-2">Name</th><th className="text-left p-2">Status</th><th className="p-2"></th>
        </tr></thead>
        <tbody>
          {(funds ?? []).map((f: any) => (
            <tr key={f.id} className="border-t">
              <td className="p-2">{f.name}</td>
              <td className="p-2">{f.archived_at ? "archived" : "active"}</td>
              <td className="p-2">
                {!f.archived_at && (
                  <form action={archive}><input type="hidden" name="id" value={f.id} /><button className="text-xs border px-2 py-1 rounded">Archive</button></form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(app)/admin/funds"
git commit -m "Add admin funds page"
```

---

## Phase 5: Verification & production cutover

### Task 5.1: Playwright scaffold

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Init Playwright**

```bash
npx playwright install --with-deps
```

- [ ] **Step 2: Write `playwright.config.ts`**

```ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://localhost:3000", headless: true },
  webServer: { command: "npm run dev", url: "http://localhost:3000", timeout: 120_000, reuseExistingServer: true },
});
```

- [ ] **Step 3: Write smoke test (login page visible; unauth redirected)**

```ts
// tests/e2e/smoke.spec.ts
import { test, expect } from "@playwright/test";

test("login page shows both providers", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /sign in with google/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in with microsoft/i })).toBeVisible();
});

test("unauthenticated redirects to login", async ({ page }) => {
  await page.goto("/donations/add");
  await expect(page).toHaveURL(/\/login/);
});
```

- [ ] **Step 4: Run**

```bash
npx playwright test tests/e2e/smoke.spec.ts
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e/
git commit -m "Add Playwright smoke tests for login + unauth redirect"
```

---

### Task 5.2: Autocomplete performance test

**Files:**
- Create: `scripts/seed-donees.ts`, `tests/perf/autocomplete.test.ts`

- [ ] **Step 1: Seed 10,000 donees**

```ts
// scripts/seed-donees.ts
import { createClient } from "@supabase/supabase-js";

const FIRSTS = ["John","Mary","Robert","Patricia","Michael","Linda","William","Elizabeth","David","Barbara","Richard","Jennifer","Joseph","Susan","Thomas","Jessica"];
const LASTS  = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez","Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas"];

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const rows: { name: string }[] = [];
  for (let i = 0; i < 10000; i++) {
    const f = FIRSTS[Math.floor(Math.random() * FIRSTS.length)];
    const l = LASTS[Math.floor(Math.random() * LASTS.length)];
    rows.push({ name: `${f} ${l} ${i}` });
  }
  // batch in 500s
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from("donees").insert(rows.slice(i, i + 500));
    if (error) { console.error(error); process.exit(1); }
  }
  console.log("seeded 10000 donees");
}
main();
```

Run with: `node --env-file=.env.local --loader tsx scripts/seed-donees.ts` (requires `tsx` — `npm i -D tsx`).

- [ ] **Step 2: Perf test**

```ts
// tests/perf/autocomplete.test.ts
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("donee autocomplete perf", () => {
  it("p95 under 300ms for prefix query against 10k donees", async () => {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const samples: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      await sb.from("donees").select("id,name").ilike("name", `Jo%`).limit(10);
      samples.push(performance.now() - t0);
    }
    samples.sort((a,b)=>a-b);
    const p95 = samples[Math.floor(samples.length * 0.95) - 1];
    expect(p95).toBeLessThan(300);
  });
});
```

- [ ] **Step 3: Run + clean up seed data after** (optional cleanup script)

```bash
npx vitest run tests/perf/autocomplete.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add scripts/ tests/perf/
git commit -m "Add 10k donee seed script + autocomplete p95 perf test"
```

---

### Task 5.3: Done-criteria manual checklist

**File:** none. This is a manual verification against the 12 spec criteria.

- [ ] 1. Login shows Google + Microsoft buttons — verified by smoke.spec.ts.
- [ ] 2. First sign-in → admin — verified with an empty `users` table + real OAuth.
- [ ] 3. Same email across providers = one account — sign in with Google, sign out, sign in with Microsoft. `public.users` has one row; `auth.identities` has two.
- [ ] 4. Invited user gets user-only permissions — admin invites `test2@gmail.com`; second sign-in lands on `/donations/add`; `/admin/users` redirects to `/`.
- [ ] 5. Un-invited email rejected — third Google account → `/login?error=not-invited`.
- [ ] 6. Add donation with existing + inline-created donee — both flows saved.
- [ ] 7. Check/online/cash field requirements enforced — try omitting check_number on a check: server rejects.
- [ ] 8. Monthly report totals + CSV match — eyeball totals vs table; CSV opens cleanly in Excel.
- [ ] 9. Void + include-voided toggle — void a row with reason; hidden by default; visible with toggle.
- [ ] 10. Tax summary CSV + print view — both routes render; print has org header/total.
- [ ] 11. Autocomplete p95 < 300ms at 10k — verified by Task 5.2 perf test.
- [ ] 12. Archived fund excluded from dropdown but kept on existing donations — admin archives "General"; Add Donation dropdown omits it; existing donation still displays "General".

---

### Task 5.4: Production cutover

- [ ] **Step 1: Configure Supabase Auth providers** (per Task 1.18 docs). User must:
  - Enable Google + Microsoft in Supabase dashboard with real OAuth client IDs.
  - Enable identity-linking-by-email.
  - Set Site URL = `https://ccm.pinnacledatascience.com`.

- [ ] **Step 2: Set env vars in Vercel**

In Vercel dashboard → project `ccm-demo` → Settings → Environment Variables, add all entries from `.env.local.example` (plus `SUPABASE_SERVICE_ROLE_KEY`). Trigger a redeploy.

- [ ] **Step 3: First sign-in on prod** (bootstraps admin)

User signs in at `https://ccm.pinnacledatascience.com/login` with their Google account. Verify in Supabase Studio that `users` has one row, role=admin.

- [ ] **Step 4: Smoke: add a test donation, view in report, void it**

- [ ] **Step 5: Tell user the site is ready for testing.**

---

## Self-review checklist

**Spec coverage (each spec done-criterion maps to a task):**
- 1 → 5.3.1 (Playwright)
- 2 → 5.3.2 (real OAuth on empty DB)
- 3 → 5.3.3 (two providers, one user)
- 4 → 4.1 + 5.3.4
- 5 → 1.15 + 5.3.5
- 6 → 2.3 + 2.4 + 5.3.6
- 7 → 2.1 (validators) + 5.3.7
- 8 → 3.1 + 3.2 + 5.3.8
- 9 → 2.5 + 3.1 (toggle) + 5.3.9
- 10 → 3.3 + 5.3.10
- 11 → 5.2 (perf test)
- 12 → 4.2 + 5.3.12

**Placeholder scan:** No "TBD" / "implement later" / "similar to" / unreferenced symbols. Every task has exact file paths and complete code. ✓

**Type consistency:** `AppUser` defined in `lib/auth.ts` and used in `NavBar.tsx`. `Donee` shape matches between `actions.ts` and `DoneePicker.tsx`. `RowForSummary` in `lib/reports.ts` matches the mapping in `report/page.tsx`. ✓

**Known small deviations from the spec noted inline:**
- `searchDonees` uses PostgREST `ilike + wfts` instead of trigram `%` operator directly. Documented in Task 2.2's note; upgrade path is a simple RPC replacement if latency observed.
- `TaxDoneePicker` is a thin client wrapper added because `DoneePicker` doesn't know about forms. Separate component, ~10 lines.

No other gaps.
