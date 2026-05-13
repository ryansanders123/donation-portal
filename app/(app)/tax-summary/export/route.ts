import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { assertFeature } from "@/lib/org-context";
import { csvRow } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await requireUser();
  await assertFeature("tax_summary");
  const url = new URL(req.url);
  const doneeId = url.searchParams.get("donee");
  const year = parseInt(url.searchParams.get("year") ?? String(new Date().getFullYear()), 10);
  if (!doneeId) return new Response("missing donee", { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: donee } = await supabase.from("donees").select("name").eq("id", doneeId).single();
  const { data } = await supabase.from("donations")
    .select("date_received,type,amount,funds(name)")
    .eq("donee_id", doneeId)
    .is("voided_at", null)
    .gte("date_received", `${year}-01-01`).lt("date_received", `${year + 1}-01-01`)
    .order("date_received");

  type ExportRow = {
    date_received: string;
    type: string;
    amount: string;
    funds: { name: string } | { name: string }[] | null;
  };
  const nameOf = (rel: { name: string } | { name: string }[] | null | undefined): string => {
    if (!rel) return "";
    if (Array.isArray(rel)) return rel[0]?.name ?? "";
    return rel.name ?? "";
  };

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(enc.encode(csvRow(["date", "type", "fund", "amount"]) + "\n"));
      for (const r of ((data ?? []) as ExportRow[])) {
        ctrl.enqueue(enc.encode(csvRow([r.date_received, r.type, nameOf(r.funds), r.amount]) + "\n"));
      }
      ctrl.close();
    },
  });

  const filename = `tax-${donee?.name?.replace(/\s+/g, "_") ?? "donor"}-${year}.csv`;
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
