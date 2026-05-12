import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ApplyChunkResult,
  Mapping,
  NormalizedRow,
} from "./types";
import {
  type DoneeIndex,
  indexDonee,
  makeEmptyIndex,
  matchDonee,
  externalRefKey,
  nameAddressKey,
} from "./matchDonee";
import {
  type DedupIndex,
  checkContentAndMark,
  checkExternalAndMark,
  contentHashFor,
  externalDonationKey,
  makeEmptyDedup,
} from "./dedup";

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
      .select("source_name, external_id, content_hash")
      .or("external_id.not.is.null,content_hash.not.is.null")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`load donation dedup keys: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.source_name && r.external_id) {
        index.externalIds.add(externalDonationKey(String(r.source_name), String(r.external_id)));
      }
      if (r.content_hash) index.contentHashes.add(String(r.content_hash));
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

function pendingDoneeKey(row: NormalizedRow, sourceName: string): string {
  if (row.donor.external_id) return `external::${externalRefKey(sourceName, row.donor.external_id)}`;
  if (row.donor.email) return `email::${row.donor.email.toLowerCase()}`;
  if (row.donor.zip && row.donor.address_line1) {
    return `address::${nameAddressKey(row.donor.name, row.donor.zip, row.donor.address_line1)}`;
  }
  return `row::${row.rowIndex}`;
}

async function ensureTaxonomyEntry(
  supabase: SupabaseClient,
  table: "funds" | "campaigns" | "appeals",
  cache: Map<string, string>,
  name: string,
  organizationId: string | null | undefined,
): Promise<string> {
  const key = name.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const payload: Record<string, unknown> = { name };
  if (organizationId) payload.organization_id = organizationId;
  const { data, error } = await supabase
    .from(table)
    .insert(payload)
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
  // When set, every insert sets organization_id explicitly (required
  // for service-role CLI calls that bypass RLS and skip the column
  // DEFAULT). UI server-action calls leave it null and let the DEFAULT
  // (= public.current_org_id()) populate it.
  organizationId?: string | null;
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

  const candidateRows: NormalizedRow[] = [];
  for (const row of rows) {
    const externalCheck = checkExternalAndMark(row, ctx.sourceName, ctx.dedupIndex);
    if (externalCheck.kind === "duplicate") {
      result.duplicates++;
      continue;
    }
    candidateRows.push(row);
  }

  // Phase 1: resolve donees (create new ones in a single batch).
  const newDoneeRows: Array<{ rows: NormalizedRow[]; payload: Record<string, unknown> }> = [];
  const pendingDonees = new Map<string, number>();
  const rowToDoneeId = new Map<number, string>();

  for (const row of candidateRows) {
    const match = matchDonee(row, ctx.doneeIndex, ctx.mapping, ctx.sourceName);
    if (match.kind === "existing") {
      rowToDoneeId.set(row.rowIndex, match.doneeId);
      result.doneesMatched++;
    } else {
      const key = pendingDoneeKey(row, ctx.sourceName);
      const existingPendingIndex = pendingDonees.get(key);
      if (existingPendingIndex !== undefined) {
        newDoneeRows[existingPendingIndex].rows.push(row);
        result.doneesMatched++;
        continue;
      }

      const payload: Record<string, unknown> = {
        name: row.donor.name,
        email: row.donor.email,
        phone: row.donor.phone,
        address_line1: row.donor.address_line1,
        address_line2: row.donor.address_line2,
        city: row.donor.city,
        state: row.donor.state,
        zip: row.donor.zip,
        // created_by left null; the importing admin is logged on the batch
      };
      if (ctx.organizationId) payload.organization_id = ctx.organizationId;
      pendingDonees.set(key, newDoneeRows.length);
      newDoneeRows.push({ rows: [row], payload });
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
      const { rows: groupedRows } = newDoneeRows[i];
      const primaryRow = groupedRows[0];
      const id = inserted[i].id;
      for (const row of groupedRows) rowToDoneeId.set(row.rowIndex, id);
      indexDonee(ctx.doneeIndex, id, primaryRow.donor, ctx.sourceName);
      result.doneesCreated++;
    }

    // Store external refs for the newly-created donees.
    const refs = newDoneeRows
      .flatMap((group) => group.rows)
      .filter((row) => row.donor.external_id)
      .map((row) => {
        const ref: Record<string, unknown> = {
          donee_id: rowToDoneeId.get(row.rowIndex)!,
          source_name: ctx.sourceName,
          external_id: row.donor.external_id!,
        };
        if (ctx.organizationId) ref.organization_id = ctx.organizationId;
        return ref;
      });
    if (refs.length > 0) {
      const { error: refErr } = await ctx.supabase
        .from("donee_external_refs")
        .insert(refs);
      if (refErr) throw new Error(`insert donee_external_refs: ${refErr.message}`);
    }
  }

  // Phase 2: resolve taxonomy, dedup-check, build donation payloads.
  const toInsert: Record<string, unknown>[] = [];
  for (const row of candidateRows) {
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
          ctx.organizationId,
        );
      }
      if (row.campaign_name) {
        campaignId = await ensureTaxonomyEntry(
          ctx.supabase,
          "campaigns",
          ctx.taxonomy.campaigns,
          row.campaign_name,
          ctx.organizationId,
        );
      }
      if (row.appeal_name) {
        appealId = await ensureTaxonomyEntry(
          ctx.supabase,
          "appeals",
          ctx.taxonomy.appeals,
          row.appeal_name,
          ctx.organizationId,
        );
      }

      let rowContentHash: string | null = null;
      if (!row.external_id) {
        const resolved = { doneeId, fundId, campaignId, appealId };
        const dup = checkContentAndMark(row, resolved, ctx.dedupIndex);
        if (dup.kind === "duplicate") {
          result.duplicates++;
          continue;
        }
        rowContentHash = contentHashFor(row, resolved);
      }

      const payload: Record<string, unknown> = {
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
        source_name: ctx.sourceName,
        external_id: row.external_id,
        content_hash: rowContentHash,
        import_batch_id: ctx.importBatchId,
        created_by: ctx.createdBy,
      };
      if (ctx.organizationId) payload.organization_id = ctx.organizationId;
      toInsert.push(payload);
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
