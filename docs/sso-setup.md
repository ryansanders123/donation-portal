# SSO Setup — Pinnacle Donations

The login page supports three sign-in methods. Code-side they're already wired —
this doc covers the **external configuration** required to turn each one on.

| Provider | Code wired | Provider config | Supabase config |
|---|---|---|---|
| Google | ✅ | already done | already done |
| Microsoft (Entra) | ✅ | needs Azure app registration | needs Azure provider |
| Email magic link | ✅ | nothing — Supabase native | enabled by default |

## Magic link

Magic links are enabled out-of-the-box by Supabase Auth. There's nothing to
configure on the provider side. Anything that affects email deliverability (SPF
/ DKIM / DMARC) is the same as for password-reset emails — see the Supabase
project's **Auth → Email Templates** and **Auth → SMTP Settings** if you swap to
custom SMTP.

The login page calls `supabase.auth.signInWithOtp({ email, ..., shouldCreateUser: false })`.
That last flag is important: it means **only invited emails** can request a
magic link — randos can't enroll themselves. The invite gate in
`app/auth/callback/route.ts` adds a second layer of protection.

## Microsoft (Azure / Entra) — one-time setup

You'll register an Azure app under **your personal Microsoft account** so you
own the client secret rotation in 24 months.

### Step 1 — Azure portal: register the app

1. Sign in to https://portal.azure.com with your personal Microsoft account.
2. Search **Microsoft Entra ID** → open it.
3. Left nav → **App registrations** → **+ New registration**.
4. Name: `Pinnacle Donations`.
5. Supported account types: **Accounts in any organizational directory and
   personal Microsoft accounts (any Azure AD directory - multitenant +
   personal Microsoft accounts e.g. Skype, Xbox)**.
6. Redirect URI:
   - Platform: **Web**
   - URL: get this from the Supabase dashboard → **Authentication → Providers
     → Azure** → "Callback URL (for OAuth)". It looks like
     `https://eqlutbgwsnyhdkaubjbh.supabase.co/auth/v1/callback`.
7. Click **Register**.

### Step 2 — Copy the Application (client) ID

From the app's **Overview** page, copy **Application (client) ID** — you'll paste this into Supabase.

### Step 3 — Create a client secret

1. Left nav → **Certificates & secrets** → **+ New client secret**.
2. Description: `Supabase OAuth`.
3. Expires: **24 months**.
4. Click **Add**.
5. **Copy the Value field immediately** (the column shown only once). It's the
   client secret you'll paste into Supabase. Do NOT copy "Secret ID" — that's
   the wrong field.

### Step 4 — API permissions

1. Left nav → **API permissions** → confirm `User.Read` is already listed.
2. **+ Add a permission** → **Microsoft Graph** → **Delegated permissions** →
   add `email`, `openid`, `profile`.
3. Click **Grant admin consent for &lt;tenant&gt;** if the button is enabled
   (otherwise users will be prompted at first sign-in — works but noisier).

### Step 5 — Token configuration (important for personal MS accounts)

Personal Microsoft accounts (`@outlook.com`, `@hotmail.com`) won't include a
verified email in the ID token by default. Add it as an optional claim so
Supabase can match the email to the invite list.

1. Left nav → **Token configuration** → **+ Add optional claim**.
2. Token type: **ID** → check **email** → **Add**. Accept the prompt to add
   the matching Microsoft Graph permission.
3. Repeat for **Access** token: **+ Add optional claim** → Token type:
   **Access** → check **email** → **Add**.

### Step 6 — Supabase: enable the Azure provider

1. Open https://supabase.com/dashboard/project/eqlutbgwsnyhdkaubjbh.
2. Left nav → **Authentication → Providers** → **Azure**.
3. Toggle **Enable Sign in with Azure**.
4. **Application (client) ID**: paste from Step 2.
5. **Application secret**: paste from Step 3.
6. **Azure Tenant URL**:
   `https://login.microsoftonline.com/common`
   (the `common` tenant supports work accounts, school accounts, and personal
   MS accounts).
7. **Save**.

### Step 7 — Site URL + redirect allow-list

Still in Supabase:

1. **Authentication → URL Configuration**.
2. **Site URL**: `https://ccm.pinnacledatascience.com`.
3. **Redirect URLs**: add
   - `https://ccm.pinnacledatascience.com/**`
   - `http://localhost:3000/**` (for local dev)
4. **Save**.

### Step 8 — Smoke test

1. Open https://ccm.pinnacledatascience.com/login (use a private window).
2. Click **Continue with Microsoft**.
3. Sign in with a personal `@outlook.com` whose email is on the invite list →
   should land on `/`.
4. Sign in with a personal `@outlook.com` that's NOT on the invite list →
   should land on `/login?error=not-invited`. Correct.

If you see `/login?error=unverified`, your Microsoft account didn't return a
verified email. Re-check Step 5 (token configuration → email optional claim
on **both** ID and Access tokens).

## Rotating the client secret

The secret expires after 24 months. To rotate:

1. Azure portal → app registration → **Certificates & secrets** → add a new
   secret.
2. Copy the Value, paste into Supabase **Authentication → Providers → Azure
   → Application secret**, save.
3. Delete the old secret in Azure once Supabase is updated.

## Future providers worth considering

- **Apple SSO** — requires a paid Apple Developer account ($99/yr). Skip
  unless you sign one up.
- **Magic link without password** — already enabled.
- Skip Facebook / GitHub for this audience.
