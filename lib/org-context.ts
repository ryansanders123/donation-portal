// Server-side helpers for active-org / branding / feature-flag.
// All functions assume an authenticated session and an active org —
// `app/(app)/layout.tsx` already redirects unauthenticated users to /login.

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { currentAppUser } from "@/lib/auth";

export type Features = {
  donations?: boolean;
  donors?: boolean;
  reports?: boolean;
  analysis?: boolean;
  funds?: boolean;
  campaigns?: boolean;
  appeals?: boolean;
  tax_summary?: boolean;
  import?: boolean;
  exports?: boolean;
  dedup?: boolean;
  [key: string]: boolean | undefined;
};

export type Organization = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
  support_email: string | null;
  mailing_address: string | null;
  tax_statement_text: string | null;
  features: Features;
  created_at: string;
};

const ORG_COLUMNS =
  "id, slug, name, logo_url, primary_color, support_email, mailing_address, tax_statement_text, features, created_at";

// The active organization for the current request. Resolved by
// public.current_org_id() (reads public.users.organization_id under
// RLS). Returns null if the user has no active org row (which should
// only happen during the brief gap between invite and first sign-in).
export async function getActiveOrg(): Promise<Organization | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organizations")
    .select(ORG_COLUMNS)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) return null;
  if (!data || data.length === 0) return null;

  // RLS limits the result to orgs the user is a member of. The "active"
  // one is whatever current_org_id returns; we read that separately.
  const { data: activeIdRow } = await supabase.rpc("current_org_id");
  const activeId = activeIdRow as unknown as string | null;
  if (!activeId) return data[0] as Organization;
  const hit = data.find((o) => o.id === activeId);
  return (hit ?? data[0]) as Organization;
}

// Every org the calling user has a user_organizations row for.
// Used by the OrgSwitcher dropdown.
export async function listUserOrgs(): Promise<Organization[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organizations")
    .select(ORG_COLUMNS)
    .order("name", { ascending: true });
  if (error) return [];
  return (data ?? []) as Organization[];
}

// Convenience for conditional rendering: hasFeature(org, "campaigns").
// Missing key → true (default-on). Explicitly false → off.
export function hasFeature(org: Organization | null, name: keyof Features): boolean {
  if (!org) return true;
  const v = org.features?.[name];
  if (v === false) return false;
  return true;
}

// Read both the active org and the user in one call. Most server
// components want both.
export async function getOrgContext(): Promise<{
  user: Awaited<ReturnType<typeof currentAppUser>>;
  org: Organization | null;
}> {
  const [user, org] = await Promise.all([currentAppUser(), getActiveOrg()]);
  return { user, org };
}

// Guard for server components on feature-gated pages. Redirects to the
// home page if the active org has the feature explicitly off. Pages
// using this should also be hidden from the nav by AdminSubNav /
// NavBar, but this is the backstop for users who type the URL directly.
export async function requireFeature(name: keyof Features): Promise<void> {
  const org = await getActiveOrg();
  if (!hasFeature(org, name)) redirect("/");
}
