import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppUser = {
  id: string;
  auth_user_id: string | null;
  email: string;
  role: "admin" | "user";
  organization_id: string;
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
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.id) return null;
  return row as AppUser;
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
