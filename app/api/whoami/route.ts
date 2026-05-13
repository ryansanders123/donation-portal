import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();
  const cookieStore = cookies() as unknown as {
    getAll(): Array<{ name: string }>;
  };
  const cookieNames = cookieStore.getAll().map((c) => c.name);

  const supabase = await createSupabaseServerClient();

  const { data: authUser, error: authErr } = await supabase.auth.getUser();
  const { data: sess } = await supabase.auth.getSession();

  const { data: appUserRpc, error: rpcErr } = await supabase.rpc(
    "current_app_user",
  );

  const { data: orgIdRpc, error: orgRpcErr } = await supabase.rpc(
    "current_org_id",
  );

  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id,slug,name")
    .maybeSingle();

  const { count: donationCount, error: donErr } = await supabase
    .from("donations")
    .select("*", { count: "exact", head: true });

  const { data: sampleDonations, error: sampleErr } = await supabase
    .from("donations")
    .select("id,amount,date_received,organization_id")
    .order("date_received", { ascending: false })
    .limit(3);

  return NextResponse.json({
    cookieNames,
    authUser: authUser?.user
      ? { id: authUser.user.id, email: authUser.user.email }
      : null,
    hasSession: !!sess?.session,
    authError: authErr?.message ?? null,
    appUserRpc,
    rpcError: rpcErr?.message ?? null,
    currentOrgId: orgIdRpc ?? null,
    currentOrgIdError: orgRpcErr?.message ?? null,
    organization: org ?? null,
    organizationError: orgErr?.message ?? null,
    donationCount: donationCount ?? null,
    donationCountError: donErr?.message ?? null,
    sampleDonations: sampleDonations ?? null,
    sampleError: sampleErr?.message ?? null,
  });
}
