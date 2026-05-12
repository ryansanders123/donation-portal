# New Client Setup

Default model: add the client as another organization in the same production
Supabase project and Vercel app. Create a separate Supabase/Vercel deployment
only when the client contract requires hard infrastructure separation.

## Same-platform client

1. Sign in as a platform admin.
2. Open `/admin/organizations`.
3. Create the organization with:
   - name
   - slug
   - status
   - branding
   - enabled feature flags
4. Open the organization detail page and add the first tenant admin.
5. Ask the tenant admin to sign in with Google, Microsoft, or magic link.
6. Confirm their `public.users.auth_user_id` is linked after first login.
7. Import data through the tenant import workflow if historical donation data exists.
8. Smoke test as that tenant:
   - add donation
   - monthly report
   - donor tax summary
   - export CSV
   - tenant admin user/fund management

Platform admins are stored on `public.users.platform_admin`. Tenant admins are
stored in `public.user_organizations.role = 'admin'`.

## Auth configuration

For the shared production deployment, Supabase Auth is already configured for:

- Google OAuth
- Microsoft/Entra OAuth
- email magic link
- Site URL `https://ccmc.pinnacledatascience.com`

If a new custom domain is added, update Supabase Auth URL Configuration:

- Site URL if the new domain becomes the canonical app URL.
- Redirect allow-list with `https://<domain>/**`.
- OAuth provider redirect URIs if the provider requires explicit domain entries.

See `docs/sso-setup.md` for provider setup details.

## Vercel env vars

Production is already configured for the shared app. If creating a separate
Vercel project, set every variable from `.env.local.example`, including:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Preview/development envs are not fully normalized through the CLI right now;
use the Vercel dashboard if previews need production-like configuration.

## Separate database or deployment

Only use this path for a client that needs dedicated infrastructure.

1. Create the new Supabase project.
2. Configure Google/Microsoft/email auth.
3. Set the Vercel env vars for the new project.
4. Run migrations through the Supabase pooler:

   ```bash
   export SUPABASE_DB_URL="postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres"
   node scripts/apply-migrations.mjs
   ```

5. Seed the first platform admin or insert the first invited user.
6. Deploy Vercel from `main`.
7. Smoke test login, org creation, donation entry, reports, and exports.

Do not add app runtime reads through raw `DATABASE_URL`; runtime database access
should stay on Supabase clients and RPCs.
