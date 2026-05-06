# Pinnacle Donations — Done Criteria Checklist

Manual verification against the 12 spec criteria from the implementation plan
(`docs/superpowers/plans/2026-04-16-donation-mgmt.md`, Task 5.3).

Fill in the status column as each criterion is verified on
`https://ccm.pinnacledatascience.com` (or a preview deployment if validating
pre-cutover). Link PRs or screenshots as evidence where useful.

## Criteria

- [ ] **1. Login shows Google + Microsoft buttons**
  - How to verify: visit `/login`; both provider buttons render.
  - Automated: covered by `tests/e2e/smoke.spec.ts` (`login page shows both providers`).

- [ ] **2. First sign-in is bootstrapped to admin**
  - How to verify: with an empty `public.users` table, sign in via real Google OAuth.
    Expect a row in `public.users` with `role='admin'` and `first_login_at` populated.

- [ ] **3. Same email across providers = one account**
  - How to verify: sign in with Google, sign out, sign in with Microsoft using the
    same email. Confirm `public.users` still has exactly one row for that email and
    `auth.identities` has two rows (one per provider) linked to the same auth user.

- [ ] **4. Invited user gets user-only permissions**
  - How to verify: as an admin, invite `test2@gmail.com`. On that account's second
    sign-in they land on `/donations/add`. Hitting `/admin/users` redirects them to `/`.

- [ ] **5. Un-invited email rejected**
  - How to verify: attempt sign-in with a Google account not in `public.users`.
    Expect redirect to `/login?error=not-invited` and no row created.

- [ ] **6. Add donation with existing + inline-created donee**
  - How to verify: on `/donations/add`, once pick an existing donee from autocomplete
    and submit; once type a new name, use the inline-create flow, and submit. Both
    rows appear in `public.donations`.

- [ ] **7. Check / online / cash field requirements enforced**
  - How to verify: submit a `check` donation without `check_number`; the server action
    should reject with a validation error (Zod / server-side, not just client).

- [ ] **8. Monthly report totals + CSV match**
  - How to verify: open `/report` for a given month. Eyeball the totals vs the table
    rows; download the CSV and confirm Excel opens it cleanly and the same totals
    reconcile.

- [ ] **9. Void + include-voided toggle**
  - How to verify: void an existing donation with a reason. By default it is hidden
    from the monthly report; enabling the "include voided" toggle makes it visible
    (with an indicator) but it must not count toward totals.

- [ ] **10. Tax summary CSV + print view**
  - How to verify: for a chosen donor, `/tax-summary` renders; its CSV downloads; the
    print view has the org header and total clearly formatted.

- [ ] **11. Autocomplete p95 < 300ms at 10k donees**
  - How to verify: seed with `node --env-file=.env.local scripts/seed-donees.mjs`
    then run `npx vitest run tests/perf/autocomplete.test.ts`. Expect p95 < 300ms.
  - Automated: `tests/perf/autocomplete.test.ts`.
  - Cleanup afterward: `node --env-file=.env.local scripts/seed-donees.mjs --cleanup`.

- [ ] **12. Archived fund excluded from new-donation dropdown but preserved on old rows**
  - How to verify: as admin, archive the "General" fund. Open `/donations/add` — the
    dropdown must not list "General". Open an existing donation that already uses
    "General" — the display must still show "General" as the fund name.

## Production cutover (Task 5.4 — owner: user, not agent)

- [ ] Supabase Auth: enable Google + Microsoft with real OAuth clients
- [ ] Supabase Auth: enable identity-linking-by-email
- [ ] Supabase Auth: set Site URL = `https://ccm.pinnacledatascience.com`
- [ ] Vercel env vars: set all entries from `.env.local.example` + `SUPABASE_SERVICE_ROLE_KEY`, redeploy
- [ ] First sign-in on prod bootstraps admin, verified in Supabase Studio
- [ ] Prod smoke: add a test donation, see it in the report, void it
- [ ] Notify stakeholders the site is ready for UAT
