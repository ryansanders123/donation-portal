"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { canonicalPair } from "@/lib/dedup";

// Permanently mark a pair as "not a duplicate". Idempotent — re-rejecting
// is a no-op via the unique key.
export async function rejectDupPair(input: { idA: string; idB: string }): Promise<void> {
  const admin = await requireAdmin();
  const { a, b } = canonicalPair(input.idA, input.idB);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("donee_dup_rejections")
    .upsert(
      { donee_a_id: a, donee_b_id: b, rejected_by: admin.id },
      { onConflict: "organization_id,donee_a_id,donee_b_id" },
    );
  if (error) throw new Error(`rejectDupPair: ${error.message}`);
  revalidatePath("/admin/dedup");
  revalidatePath("/donors", "layout");
}

// Merge two donees atomically via the SQL function. The `merged` object
// is the admin's chosen values for each field on the resulting winner.
export type MergedFields = {
  name: string;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

export async function mergeDonees(input: {
  winnerId: string;
  loserId: string;
  merged: MergedFields;
}): Promise<{ mergeId: string }> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("do_merge_donees", {
    p_winner_id: input.winnerId,
    p_loser_id: input.loserId,
    p_merged: input.merged,
  });
  if (error) throw new Error(`mergeDonees: ${error.message}`);
  revalidatePath("/admin/dedup");
  revalidatePath("/admin/dedup/history");
  revalidatePath("/donors", "layout");
  revalidatePath("/report");
  return { mergeId: data as unknown as string };
}

export async function undoMerge(mergeId: string): Promise<void> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("do_undo_merge", { p_merge_id: mergeId });
  if (error) throw new Error(`undoMerge: ${error.message}`);
  revalidatePath("/admin/dedup");
  revalidatePath("/admin/dedup/history");
  revalidatePath("/donors", "layout");
  revalidatePath("/report");
}
