"use server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/auth";
import { inviteInputSchema, fundInputSchema, campaignInputSchema, appealInputSchema } from "@/lib/validators";
import { assertFeature } from "@/lib/org-context";
import { revalidatePath } from "next/cache";

export async function inviteUser(input: unknown) {
  const admin = await requireAdmin();
  const { email } = inviteInputSchema.parse(input);
  const supabase = createSupabaseServiceClient();
  const normalizedEmail = email.toLowerCase();
  const { data: existing, error: lookupError } = await supabase
    .from("users")
    .select("id, removed_at")
    .eq("email", normalizedEmail)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);

  let userId = existing?.id as string | undefined;
  if (!userId) {
    const { data: inserted, error } = await supabase
      .from("users")
      .insert({
        email: normalizedEmail,
        role: "user",
        invited_by: admin.id,
        organization_id: admin.organization_id,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    userId = inserted.id;
  } else if (existing?.removed_at) {
    const { error } = await supabase
      .from("users")
      .update({ removed_at: null })
      .eq("id", userId);
    if (error) throw new Error(error.message);
  }

  const { error: membershipError } = await supabase
    .from("user_organizations")
    .upsert(
      {
        user_id: userId,
        organization_id: admin.organization_id,
        role: "member",
      },
      { onConflict: "user_id,organization_id" },
    );
  if (membershipError) throw new Error(membershipError.message);
  revalidatePath("/admin/users");
}

export async function setUserRole(userId: string, role: "admin" | "user") {
  const admin = await requireAdmin();
  if (userId === admin.id && role === "user") throw new Error("Can't demote yourself");
  const supabase = createSupabaseServiceClient();
  const membershipRole = role === "admin" ? "admin" : "member";
  const { error: membershipError } = await supabase
    .from("user_organizations")
    .upsert(
      {
        user_id: userId,
        organization_id: admin.organization_id,
        role: membershipRole,
      },
      { onConflict: "user_id,organization_id" },
    );
  if (membershipError) throw new Error(membershipError.message);

  const { error } = await supabase
    .from("users")
    .update({ role })
    .eq("id", userId)
    .eq("organization_id", admin.organization_id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

export async function removeUser(userId: string) {
  const admin = await requireAdmin();
  if (userId === admin.id) throw new Error("Can't remove yourself");
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from("user_organizations")
    .delete()
    .eq("user_id", userId)
    .eq("organization_id", admin.organization_id);
  if (error) throw new Error(error.message);

  const { data: memberships, error: countError } = await supabase
    .from("user_organizations")
    .select("organization_id, role")
    .eq("user_id", userId)
    .limit(1);
  if (countError) throw new Error(countError.message);

  if (!memberships || memberships.length === 0) {
    const { error: removeError } = await supabase
      .from("users")
      .update({ removed_at: new Date().toISOString() })
      .eq("id", userId);
    if (removeError) throw new Error(removeError.message);
  } else {
    const next = memberships[0];
    const { error: updateError } = await supabase
      .from("users")
      .update({
        organization_id: next.organization_id,
        role: next.role === "admin" ? "admin" : "user",
      })
      .eq("id", userId)
      .eq("organization_id", admin.organization_id);
    if (updateError) throw new Error(updateError.message);
  }
  revalidatePath("/admin/users");
}

export async function addFund(input: unknown) {
  await requireAdmin();
  await assertFeature("funds");
  const { name } = fundInputSchema.parse(input);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("funds").insert({ name });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/funds");
}

export async function archiveFund(id: string) {
  await requireAdmin();
  await assertFeature("funds");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("funds").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/funds");
}

export async function restoreFund(id: string) {
  await requireAdmin();
  await assertFeature("funds");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("funds").update({ archived_at: null }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/funds");
}

// --- Campaigns ---

export async function addCampaign(input: unknown) {
  const admin = await requireAdmin();
  await assertFeature("campaigns");
  const parsed = campaignInputSchema.parse(input);
  const supabase = await createSupabaseServerClient();
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
  await assertFeature("campaigns");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("campaigns").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/campaigns");
}

export async function restoreCampaign(id: string) {
  await requireAdmin();
  await assertFeature("campaigns");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("campaigns").update({ archived_at: null }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/campaigns");
}

// --- Appeals ---

export async function addAppeal(input: unknown) {
  const admin = await requireAdmin();
  await assertFeature("appeals");
  const parsed = appealInputSchema.parse(input);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("appeals").insert({ name: parsed.name, created_by: admin.id });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/appeals");
}

export async function archiveAppeal(id: string) {
  await requireAdmin();
  await assertFeature("appeals");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("appeals").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/appeals");
}

export async function restoreAppeal(id: string) {
  await requireAdmin();
  await assertFeature("appeals");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("appeals").update({ archived_at: null }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/appeals");
}
