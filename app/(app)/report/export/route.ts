import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { assertFeature } from "@/lib/org-context";
import { monthRange } from "@/lib/reports";
import { csvRow, CSV_HEADERS } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await requireUser();
  await assertFeature("reports");
  const url = new URL(req.url);
  const [y, m] = (url.searchParams.get("month") ?? new Date().toISOString().slice(0, 7)).split("-").map(Number);
  const includeVoided = url.searchParams.get("voided") === "1";
  const fundFilter = url.searchParams.get("fund") ?? "";
  const campaignFilter = url.searchParams.get("campaign") ?? "";
  const appealFilter = url.searchParams.get("appeal") ?? "";
  const { start, end } = monthRange(y, m);

  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("donations")
    .select("date_received,type,amount,check_number,reference_id,note,voided_at,void_reason,donees(name),funds(name),campaigns(name),appeals(name)")
    .gte("date_received", start).lt("date_received", end)
    .order("date_received", { ascending: true });
  if (!includeVoided) q = q.is("voided_at", null);
  if (fundFilter) q = q.eq("fund_id", fundFilter);
  if (campaignFilter) q = q.eq("campaign_id", campaignFilter);
  if (appealFilter) q = q.eq("appeal_id", appealFilter);
  const { data } = await q;

  type ExportRow = {
    date_received: string;
    type: string;
    amount: string;
    check_number: string | null;
    reference_id: string | null;
    note: string | null;
    voided_at: string | null;
    void_reason: string | null;
    donees: { name: string } | { name: string }[] | null;
    funds: { name: string } | { name: string }[] | null;
    campaigns: { name: string } | { name: string }[] | null;
    appeals: { name: string } | { name: string }[] | null;
  };
  const nameOf = (rel: { name: string } | { name: string }[] | null | undefined): string => {
    if (!rel) return "";
    if (Array.isArray(rel)) return rel[0]?.name ?? "";
    return rel.name ?? "";
  };

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(enc.encode(csvRow(CSV_HEADERS) + "\n"));
      for (const r of ((data ?? []) as ExportRow[])) {
        ctrl.enqueue(enc.encode(csvRow([
          r.date_received, nameOf(r.donees), r.type, nameOf(r.funds), nameOf(r.campaigns), nameOf(r.appeals), r.amount,
          r.check_number ?? "", r.reference_id ?? "", r.note ?? "",
          r.voided_at ? "true" : "false", r.void_reason ?? "",
        ]) + "\n"));
      }
      ctrl.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="donations-${y}-${String(m).padStart(2, "0")}.csv"`,
    },
  });
}
