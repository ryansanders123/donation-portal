import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ApplyChunkResult,
  Mapping,
  NormalizedRow,
  RowError,
} from "./types";
import {
  type DoneeIndex,
  indexDonee,
  makeEmptyIndex,
  matchDonee,
  externalRefKey,
  nameAddressKey,
} from "./matchDonee";
import { type DedupIndex, checkAndMark, makeEmptyDedup } from "./dedup";

// ---- Index loaders ---------------------------------------------------
//
// Run these ONCE at the start of a batch. They scope to the current org
// implicitly via RLS (no organization_id filter needed in the queries).

export async function loadDoneeIndex(
  supabase: SupabaseClient,
  sourceName: string,
): Promise<DoneeIndex> {
  const index = makeEmptyIndex();

  // Page through donees so we don't hit Supabase's 1000-row default.
  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("donees")
      .select("id, name, email, zip, address_line1")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`load donees: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const d of data) {
      if (d.email) index.byEmail.set(String(d.email).toLowerCase(), d.id);
      if (d.zip && d.address_line1 && d.name) {
        index.byNameAddress.set(
          nameAddressKey(d.name, d.zip, d.address_line1),
          d.id,
        );
      }
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // External refs for this source.
  let efFrom = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("donee_external_refs")
      .select("donee_id, external_id")
      .eq("source_name", sourceName)
      .range(efFrom, efFrom + PAGE - 1);
    if (error) throw new Error(`load donee_external_refs: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data) {
      index.byExternalRef.set(externalRefKey(sourceName, r.external_id), r.donee_id);
    }
    if (data.length < PAGE) break;
    efFrom += PAGE;
  }

  return index;
}

export async function loadDedupIndex(
  supabase: SupabaseClient,
): Promise<DedupIndex> {
  const index = makeEmptyDedup();
  // Only need external_ids — content hash is built incrementally per
  // chunk against rows already in the index.
  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("donations")
      .select("external_id")
      .not("external_id", "is", null)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`load donations.external_id: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.external_id) index.externalIds.add(String(r.external_id).toLowerCase());
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return index;
}

// ---- Taxonomy cache --------------------------------------------------

export type TaxonomyCache = {
  funds: Map<string, string>;     // lowercased name → id
  campaigns: Map<string, string>;
  appeals: Map<string, string>;
};

export async function loadTaxonomyCache(
  supabase: SupabaseClient,
): Promise<TaxonomyCache> {
  const cache: TaxonomyCache = {
    funds: new Map(),
    campaigns: new Map(),
    appeals: new Map(),
  };
  const [funds, campaigns, appeals] = await Promise.all([
    supabase.from("funds").select("id, name"),
    supabase.from("campaigns").select("id, name"),
    supabase.from("appeals").select("id, name"),
  ]);
  if (funds.error) throw new Error(`load funds: ${funds.error.message}`);
  if (campaigns.error) throw new Error(`load campaigns: ${campaigns.error.message}`);
  if (appeals.error) throw new Error(`load appeals: ${appeals.error.message}`);
  for (const f of funds.data ?? []) cache.funds.set(f.name.toLowerCase(), f.id);
  for (const c of campaigns.data ?? []) cache.campaigns.set(c.name.toLowerCase(), c.id);
  for (const a of appeals.data ?? []) cache.appeals.set(a.name.toLowerCase(), a.id);
  return cache;
}

async function ensureTaxonomyEntry(
  supabase: SupabaseClient,
  table: "funds" | "campaigns" | "appeals",
  cache: Map<string, string>,
  name: string,
): Promise<string> {
  const key = name.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const { data, error } = await supabase
    .from(table)
    .insert({ name })
    .select("id")
    .single();
  if (error) throw new Error(`create ${table} "${name}": ${error.message}`);
  cache.set(key, data.id);
  return data.id;
}

// ---- Apply -----------------------------------------------------------

export type ApplyContext = {
  supabase: SupabaseClient;
  doneeIndex: DoneeIndex;
  dedupIndex: DedupIndex;
  taxonomy: TaxonomyCache;
  mapping: Mapping;
  sourceName: string;
  importBatchId: string;
  createdBy: string;          // public.users.id of the importing admin
};

export async function applyChunk(
  ctx: ApplyContext,
  rows: NormalizedRow[],
): Promise<ApplyChunkResult> {
  const result: ApplyChunkResult = {
    inserted: 0,
    duplicates: 0,
    errors: [],
    doneesCreated: 0,
    doneesMatched: 0,
  };

  // Phase 1: resolve donees (create new ones in a single batch).
  const newDoneeRows: Array<{ row: NormalizedRow; payload: Record<string, unknown> }> = [];
  const rowToDoneeId = new Map<number, string>();

  for (const row of rows) {
    const match = matchDonee(row, ctx.doneeIndex, ctx.mapping, ctx.sourceName);
    if (match.kind === "existing") {
      rowToDoneeId.set(row.rowIndex, match.doneeId);
      result.doneesMatched++;
    } else {
      newDoneeRows.push({
        row,
        payload: {
          name: row.donor.name,
          email: row.donor.email,
          phone: row.donor.phone,
          address_line1: row.donor.address_line1,
          address_line2: row.donor.address_line2,
          city: row.donor.city,
          state: row.donor.state,
          zip: row.donor.zip,
          // organization_id auto-populated via column default
          // created_by left null; the importing admin is logged on the batch
        },
      });
    }
  }

  if (newDoneeRows.length > 0) {
    const { data: inserted, error } = await ctx.supabase
      .from("donees")
      .insert(newDoneeRows.map((r) => r.payload))
      .select("id");
    if (error) throw new Error(`insert donees: ${error.message}`);
    if (!inserted || inserted.length !== newDoneeRows.length) {
      throw new Error(
        `donee insert returned ${inserted?.length ?? 0} rows, expected ${newDoneeRows.length}`,
      );
    }
    for (let i = 0; i < newDoneeRows.length; i++) {
      const { row } = newDoneeRows[i];
      const id = inserted[i].id;
      rowToDoneeId.set(row.rowIndex, id);
      indexDonee(ctx.doneeIndex, id, row.donor, ctx.sourceName);
      result.doneesCreated++;
    }

    // Store external refs for the newly-created donees.
    const refs = newDoneeRows
      .filter((r) => r.row.donor.external_id)
      .map((r) => ({
        donee_id: rowToDoneeId.get(r.row.rowIndex)!,
        source_name: ctx.sourceName,
        external_id: r.row.donor.external_id!,
      }));
    if (refs.length > 0) {
      const { error: refErr } = await ctx.supabase
        .from("donee_external_refs")
        .insert(refs);
      if (refErr) throw new Error(`insert donee_external_refs: ${refErr.message}`);
    }
  }

  // Phase 2: resolve taxonomy, dedup-check, build donation payloads.
  const toInsert: Record<string, unknown>[] = [];
  for (const row of rows) {
    try {
      const doneeId = rowToDoneeId.get(row.rowIndex);
      if (!doneeId) {
        result.errors.push({
          rowIndex: row.rowIndex,
          reason: "donee resolution failed",
        });
        continue;
      }

      let fundId: string | null = null;
      let campaignId: string | null = null;
      let appealId: string | null = null;
      if (row.fund_name) {
        fundId = await ensureTaxonomyEntry(
          ctx.supabase,
          "funds",
          ctx.taxonomy.funds,
          row.fund_name,
        );
      }
      if (row.campaign_name) {
        campaignId = await ensureTaxonomyEntry(
          ctx.supabase,
          "campaigns",
          ctx.taxonomy.campaigns,
          row.campaign_name,
        );
      }
      if (row.appeal_name) {
        appealId = await ensureTaxonomyEntry(
          ctx.supabase,
          "appeals",
          ctx.taxonomy.appeals,
          row.appeal_name,
        );
      }

      const dup = checkAndMark(
        row,
        { doneeId, fundId, campaignId, appealId },
        ctx.dedupIndex,
      );
      if (dup.kind === "duplicate") {
        result.duplicates++;
        continue;
      }

      toInsert.push({
        donee_id: doneeId,
        fund_id: fundId,
        campaign_id: campaignId,
        appeal_id: appealId,
        type: row.type,
        amount: row.amount,
        date_received: row.date_received,
        check_number: row.check_number,
        reference_id: row.reference_id,
        note: row.note,
        external_id: row.external_id,
        import_batch_id: ctx.importBatchId,
        created_by: ctx.createdBy,
        // organization_id auto-populated via column default
      });
    } catch (e) {
      result.errors.push({
        rowIndex: row.rowIndex,
        reason: (e as Error).message,
      });
    }
  }

  if (toInsert.length > 0) {
    const { error } = await ctx.supabase.from("donations").insert(toInsert);
    if (error) {
      // Fall back to row-by-row to identify the failing rows.
      for (const payload of toInsert) {
        const single = await ctx.supabase.from("donations").insert(payload);
        if (single.error) {
          result.errors.push({
            rowIndex: -1,
            reason: `donation insert: ${single.error.message}`,
          });
        } else {
          result.inserted++;
        }
      }
    } else {
      result.inserted += toInsert.length;
    }
  }

  return result;
}

// Sum up multiple ApplyChunkResults for the batch-level totals.
export function combineResults(parts: ApplyChunkResult[]): ApplyChunkResult {
  const total: ApplyChunkResult = {
    inserted: 0,
    duplicates: 0,
    errors: [],
    doneesCreated: 0,
    doneesMatched: 0,
  };
  for (const p of parts) {
    total.inserted += p.inserted;
    total.duplicates += p.duplicates;
    total.errors.push(...p.errors);
    total.doneesCreated += p.doneesCreated;
    total.doneesMatched += p.doneesMatched;
  }
  return total;
}
