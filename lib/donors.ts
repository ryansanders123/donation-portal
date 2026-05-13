import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DonorListRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  lifetime_total: number;
  gift_count: number;
  last_gift_at: string | null;
};

export type GiftRow = {
  id: string;
  amount: string;
  type: "cash" | "check" | "online";
  date_received: string;
  check_number: string | null;
  reference_id: string | null;
  fund_name: string | null;
  campaign_name: string | null;
  appeal_name: string | null;
};

export type DonorPivot = {
  years: number[];
  funds: string[];
  cells: Record<number, Record<string, number>>;
  rowTotals: Record<number, number>;
  colTotals: Record<string, number>;
  grand: number;
};

export type DonorDetail = {
  donee: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  };
  gifts: GiftRow[];
  pivot: DonorPivot;
};

export async function getDonorList(): Promise<DonorListRow[]> {
  const supabase = await createSupabaseServerClient();

  // Single round-trip via the donor_list_v view (migration 0010) — Postgres
  // does the aggregation; no in-app paging through 12k donations.
  const { data, error } = await supabase
    .from("donor_list_v")
    .select("id,name,email,phone,lifetime_total,gift_count,last_gift_at")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);

  type Row = { id: string; name: string; email: string | null; phone: string | null; lifetime_total: string | number; gift_count: number; last_gift_at: string | null };
  return ((data ?? []) as Row[]).map((d) => ({
    id: d.id,
    name: d.name,
    email: d.email,
    phone: d.phone,
    lifetime_total: Number(d.lifetime_total),
    gift_count: d.gift_count,
    last_gift_at: d.last_gift_at,
  }));
}

export async function getDonorDetail(id: string): Promise<DonorDetail | null> {
  const supabase = await createSupabaseServerClient();

  const { data: donee, error: doneeErr } = await supabase
    .from("donees")
    .select(
      "id,name,email,phone,address,address_line1,address_line2,city,state,zip"
    )
    .eq("id", id)
    .maybeSingle();
  if (doneeErr) throw new Error(doneeErr.message);
  if (!donee) return null;

  const { data: gifts, error: giftErr } = await supabase
    .from("donations")
    .select(
      "id,amount,type,date_received,check_number,reference_id,funds(name),campaigns(name),appeals(name)"
    )
    .eq("donee_id", id)
    .is("voided_at", null)
    .order("date_received", { ascending: false });
  if (giftErr) throw new Error(giftErr.message);

  type RawGift = {
    id: string;
    amount: string;
    type: "cash" | "check" | "online";
    date_received: string;
    check_number: string | null;
    reference_id: string | null;
    funds: { name: string } | { name: string }[] | null;
    campaigns: { name: string } | { name: string }[] | null;
    appeals: { name: string } | { name: string }[] | null;
  };
  const nameOf = (rel: { name: string } | { name: string }[] | null | undefined): string | null => {
    if (!rel) return null;
    if (Array.isArray(rel)) return rel[0]?.name ?? null;
    return rel.name ?? null;
  };

  const flat: GiftRow[] = ((gifts ?? []) as RawGift[]).map((g) => ({
    id: g.id,
    amount: g.amount,
    type: g.type,
    date_received: g.date_received,
    check_number: g.check_number,
    reference_id: g.reference_id,
    fund_name: nameOf(g.funds),
    campaign_name: nameOf(g.campaigns),
    appeal_name: nameOf(g.appeals),
  }));

  // Build pivot: years × funds (treating null fund as "(no fund)").
  const yearSet = new Set<number>();
  const fundSet = new Set<string>();
  const cells: Record<number, Record<string, number>> = {};
  const rowTotals: Record<number, number> = {};
  const colTotals: Record<string, number> = {};
  let grand = 0;
  for (const g of flat) {
    const year = Number(g.date_received.slice(0, 4));
    const fund = g.fund_name ?? "(no fund)";
    const amt = Number(g.amount);
    yearSet.add(year);
    fundSet.add(fund);
    cells[year] ??= {};
    cells[year][fund] = (cells[year][fund] ?? 0) + amt;
    rowTotals[year] = (rowTotals[year] ?? 0) + amt;
    colTotals[fund] = (colTotals[fund] ?? 0) + amt;
    grand += amt;
  }

  const years = Array.from(yearSet).sort((a, b) => b - a);
  const funds = Array.from(fundSet).sort((a, b) => a.localeCompare(b));

  return {
    donee: donee as DonorDetail["donee"],
    gifts: flat,
    pivot: { years, funds, cells, rowTotals, colTotals, grand },
  };
}
