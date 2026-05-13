import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { assertFeature } from "@/lib/org-context";
import { csvRow } from "@/lib/csv";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;

type Joined = { name: string } | { name: string }[] | null;
const nameOf = (rel: Joined): string => {
  if (!rel) return "";
  if (Array.isArray(rel)) return rel[0]?.name ?? "";
  return rel.name ?? "";
};

export async function GET(req: NextRequest) {
  await requireAdmin();
  await assertFeature("exports");
  const url = new URL(req.url);
  const type = url.searchParams.get("type") === "detail" ? "detail" : "summary";
  const year = parseInt(url.searchParams.get("year") ?? String(new Date().getFullYear()), 10);
  const threshold = Number(url.searchParams.get("threshold") ?? "0");
  const fundFilter = url.searchParams.get("fund") ?? "";
  const types = url.searchParams.getAll("type_in").filter((t) =>
    t === "cash" || t === "check" || t === "online"
  );

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year + 1}-01-01`;

  const supabase = await createSupabaseServerClient();

  // Page through donations matching the filters.
  type Row = {
    id: string;
    donee_id: string;
    type: "cash" | "check" | "online";
    amount: string;
    date_received: string;
    check_number: string | null;
    reference_id: string | null;
    note: string | null;
    donees: { id: string; name: string; email: string | null; phone: string | null; address: string | null; address_line1: string | null; address_line2: string | null; city: string | null; state: string | null; zip: string | null } | null;
    funds: Joined;
    campaigns: Joined;
    appeals: Joined;
  };

  const rows: Row[] = [];
  let from = 0;
  while (true) {
    let q = supabase
      .from("donations")
      .select(
        "id,donee_id,type,amount,date_received,check_number,reference_id,note,donees(id,name,email,phone,address,address_line1,address_line2,city,state,zip),funds(name),campaigns(name),appeals(name)"
      )
      .is("voided_at", null)
      .gte("date_received", yearStart)
      .lt("date_received", yearEnd)
      .order("date_received", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (fundFilter) q = q.eq("fund_id", fundFilter);
    if (types.length > 0 && types.length < 3) q = q.in("type", types);
    const { data, error } = await q;
    if (error) return new Response(error.message, { status: 500 });
    if (!data || data.length === 0) break;
    rows.push(...((data as unknown) as Row[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const enc = new TextEncoder();
  const filename = `${type}-${year}.csv`;

  if (type === "detail") {
    const headers = [
      "donee_id", "donor_name", "donation_id", "date_received", "type",
      "fund_name", "campaign_name", "appeal_name", "amount",
      "check_number", "reference_id", "note", "tax_year",
    ];
    const stream = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(enc.encode(csvRow(headers) + "\n"));
        for (const r of rows) {
          ctrl.enqueue(enc.encode(csvRow([
            r.donee_id,
            r.donees?.name ?? "",
            r.id,
            r.date_received,
            r.type,
            nameOf(r.funds),
            nameOf(r.campaigns),
            nameOf(r.appeals),
            r.amount,
            r.check_number ?? "",
            r.reference_id ?? "",
            r.note ?? "",
            String(year),
          ]) + "\n"));
        }
        ctrl.close();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  // Summary: aggregate by donee.
  type Agg = {
    donee_id: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    total: number;
    count: number;
    first: string;
    last: string;
    byFund: Record<string, number>;
    byType: Record<string, number>;
  };
  const agg = new Map<string, Agg>();
  for (const r of rows) {
    if (!r.donees) continue;
    const cur = agg.get(r.donee_id) ?? {
      donee_id: r.donee_id,
      name: r.donees.name,
      email: r.donees.email,
      phone: r.donees.phone,
      address: r.donees.address,
      address_line1: r.donees.address_line1,
      address_line2: r.donees.address_line2,
      city: r.donees.city,
      state: r.donees.state,
      zip: r.donees.zip,
      total: 0,
      count: 0,
      first: r.date_received,
      last: r.date_received,
      byFund: {} as Record<string, number>,
      byType: {} as Record<string, number>,
    };
    const amt = Number(r.amount);
    cur.total += amt;
    cur.count += 1;
    if (r.date_received < cur.first) cur.first = r.date_received;
    if (r.date_received > cur.last) cur.last = r.date_received;
    const fundLabel = nameOf(r.funds) || "(no fund)";
    cur.byFund[fundLabel] = (cur.byFund[fundLabel] ?? 0) + amt;
    cur.byType[r.type] = (cur.byType[r.type] ?? 0) + amt;
    agg.set(r.donee_id, cur);
  }

  const sorted = Array.from(agg.values())
    .filter((a) => a.total >= threshold)
    .sort((a, b) => a.name.localeCompare(b.name));

  const headers = [
    "donee_id", "donor_name", "email", "phone",
    "address_line1", "address_line2", "city", "state", "zip",
    "total_giving", "donation_count", "first_gift_date", "last_gift_date",
    "by_fund_json", "by_type_json", "statement_required", "tax_year",
  ];
  const stream = new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(enc.encode(csvRow(headers) + "\n"));
      for (const a of sorted) {
        ctrl.enqueue(enc.encode(csvRow([
          a.donee_id,
          a.name,
          a.email ?? "",
          a.phone ?? "",
          a.address_line1 ?? "",
          a.address_line2 ?? "",
          a.city ?? "",
          a.state ?? "",
          a.zip ?? "",
          a.total.toFixed(2),
          a.count,
          a.first,
          a.last,
          JSON.stringify(a.byFund),
          JSON.stringify(a.byType),
          a.total >= 250 ? "Y" : "N",
          String(year),
        ]) + "\n"));
      }
      ctrl.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
