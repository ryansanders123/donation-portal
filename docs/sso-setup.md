# SSO Setup - Pinnacle Donations

The login page supports three sign-in methods through Supabase Auth:

| Provider | Code wired | Production config |
|---|---|---|
| Google | Yes | Configured |
| Microsoft/Entra | Yes | Configured |
| Email magic link | Yes | Configured |

Current production Site URL:

```text
https://ccmc.pinnacledatascience.com
```

Current redirect allow-list should include:

```text
https://ccmc.pinnacledatascience.com/**
http://localhost:3000/**
```

## Invite gate

All providers route through `/auth/callback`, which runs `runCallbackGate()`.
That gate matches the Supabase Auth email to an invited `public.users` row,
links `auth_user_id`, and rejects uninvited emails.

Magic-link sign-in uses:

```ts
supabase.auth.signInWithOtp({ email, ..., shouldCreateUser: false })
```

`shouldCreateUser: false` is required so uninvited emails cannot create Auth
users directly.

## Google OAuth

Production is already configured. For a new Supabase project or separate
deployment:

1. Create or open the Google Cloud OAuth app.
2. Add the Supabase callback URL as an authorized redirect URI:

   ```text
   https://<project-ref>.supabase.co/auth/v1/callback
   ```

3. Paste the Google client ID and secret into Supabase Auth Providers.
4. Confirm the domain is present in Supabase Auth URL Configuration.

## Microsoft/Entra OAuth

Production is already configured. For a new Supabase project or separate
deployment:

1. Open Azure Portal.
2. Go to Microsoft Entra ID, App registrations, New registration.
3. Name the app `Pinnacle Donations`.
4. Supported account types:

   ```text
   Accounts in any organizational directory and personal Microsoft accounts
   ```

5. Add the Supabase callback URL:

   ```text
   https://<project-ref>.supabase.co/auth/v1/callback
   ```

6. Copy the Application client ID.
7. Create a client secret and copy the secret value immediately.
8. Confirm delegated Microsoft Graph permissions include:
   - `User.Read`
   - `email`
   - `openid`
   - `profile`
9. Add `email` as an optional claim on the ID token and Access token.
10. In Supabase Auth Providers, enable Azure and set:
    - Application client ID
    - Application secret
    - Azure Tenant URL: `https://login.microsoftonline.com/common`

## Rotating Microsoft secret

1. Create a new client secret in the Azure app registration.
2. Paste the new value into Supabase Auth Providers, Azure.
3. Save and smoke test Microsoft login.
4. Delete the old secret after the new one works.

## Smoke test

1. Open `https://ccmc.pinnacledatascience.com/login` in a private browser.
2. Test Google or Microsoft with an invited email.
3. Confirm the user lands in the app.
4. Test an uninvited email.
5. Confirm the user is rejected with `not-invited`.

If Microsoft returns `/login?error=unverified`, re-check the `email` optional
claim on both ID and Access tokens.
