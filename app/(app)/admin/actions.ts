"use server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { inviteInputSchema, fundInputSchema, campaignInputSchema, appealInputSchema } from "@/lib/validators";
import { revalidatePath } from "next/cache";

export async function inviteUser(input: unknown) {
  const admin = await requireAdmin();
  const { email } = inviteInputSchema.parse(input);
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("users").insert({
    email: email.toLowerCase(),
    role: "user",
    invited_by: admin.id,
    organization_id: admin.organization_id,
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

export async function restoreFund(id: string) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("funds").update({ archived_at: null }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/funds");
}

// --- Campaigns ---

export async function addCampaign(input: unknown) {
  const admin = await requireAdmin();
  const parsed = campaignInputSchema.parse(input);
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("campaigns").insert({
    name: parsed.name,
    goal_amount: parsed.goal_amount && parsed.goal_amount !== "" ? parsed.goal_amount : null,
    start_date: parsed.start_date && parsed.start_date !== "" ? parsed.start_date : null,
    end_date: parsed.end_date && parsed.end_date !== "" ? parsed.end_date : null,
    created_by: admin.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/campaigns");
}

export async function archiveCampaign(id: string) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("campaigns").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/campaigns");
}

export async function restoreCampaign(id: string) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("campaigns").update({ archived_at: null }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/campaigns");
}

// --- Appeals ---

export async function addAppeal(input: unknown) {
  const admin = await requireAdmin();
  const parsed = appealInputSchema.parse(input);
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("appeals").insert({ name: parsed.name, created_by: admin.id });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/appeals");
}

export async function archiveAppeal(id: string) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("appeals").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/appeals");
}

export async function restoreAppeal(id: string) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("appeals").update({ archived_at: null }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/appeals");
}
