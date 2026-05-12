"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import {
  applyChunk,
  loadDedupIndex,
  loadDoneeIndex,
  loadTaxonomyCache,
} from "@/lib/import/apply";
import { normalizeRows } from "@/lib/import/normalize";
import type {
  ApplyChunkResult,
  Mapping,
  RawRow,
  ValidateSummary,
} from "@/lib/import/types";

// Open a new import_batches row in status='pending'. Returns the batch id.
export async function createBatch(input: {
  sourceName: string;
  fileName: string;
  fileSize: number;
  fileHash: string;
  mapping: Mapping;
  rowsTotal: number;
}): Promise<{ batchId: string }> {
  const admin = await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("import_batches")
    .insert({
      source_name: input.sourceName,
      file_name: input.fileName,
      file_size: input.fileSize,
      file_hash: input.fileHash,
      mapping: input.mapping,
      rows_total: input.rowsTotal,
      created_by: admin.id,
      status: "pending",
    })
    .select("id")
    .single();
  if (error) throw new Error(`createBatch: ${error.message}`);
  return { batchId: data.id };
}

// Pure dry-run. Normalize + match + dedup, no writes.
// Loads indices once and tears them down at the end.
export async function validateBatch(input: {
  rows: RawRow[];
  mapping: Mapping;
  sourceName: string;
}): Promise<ValidateSummary> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { rows: normalized, errors } = normalizeRows(input.rows, input.mapping);
  const doneeIndex = await loadDoneeIndex(supabase, input.sourceName);
  const dedupIndex = await loadDedupIndex(supabase);

  let wouldInsert = 0;
  let wouldSkipDuplicate = 0;
  let wouldCreateNewDonees = 0;
  let wouldMatchExistingDonees = 0;

  // Simulate the dedup pass without writes. We can't fully simulate the
  // donee insert because we don't know the donee_id yet for new rows,
  // but for new donees we treat their key as a synthetic placeholder
  // unique to this row index — guaranteed not to collide with existing
  // donations.
  const { matchDonee } = await import("@/lib/import/matchDonee");
  const { checkContentAndMark, checkExternalAndMark } = await import("@/lib/import/dedup");

  for (const row of normalized) {
    const ext = checkExternalAndMark(row, input.sourceName, dedupIndex);
    if (ext.kind === "duplicate") {
      wouldSkipDuplicate++;
      continue;
    }

    const match = matchDonee(row, doneeIndex, input.mapping, input.sourceName);
    const doneeId =
      match.kind === "existing"
        ? match.doneeId
        : `__new_${row.rowIndex}__`;
    if (match.kind === "existing") wouldMatchExistingDonees++;
    else wouldCreateNewDonees++;

    if (!row.external_id) {
      const dup = checkContentAndMark(
        row,
        { doneeId, fundId: row.fund_name, campaignId: row.campaign_name, appealId: row.appeal_name },
        dedupIndex,
      );
      if (dup.kind === "duplicate") {
        wouldSkipDuplicate++;
        continue;
      }
    }

    wouldInsert++;
  }

  return {
    rowsTotal: input.rows.length,
    wouldInsert,
    wouldSkipDuplicate,
    wouldSkipError: errors.length,
    wouldCreateNewDonees,
    wouldMatchExistingDonees,
    sampleErrors: errors.slice(0, 10),
  };
}

// Apply one chunk against an existing pending batch. Idempotent on
// re-call thanks to the unique index on (organization_id, external_id).
export async function importChunk(input: {
  batchId: string;
  rows: RawRow[];
}): Promise<ApplyChunkResult> {
  const admin = await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data: batch, error: be } = await supabase
    .from("import_batches")
    .select("id, status, source_name, mapping, rows_inserted, rows_skipped, rows_duplicate, error_log")
    .eq("id", input.batchId)
    .single();
  if (be || !batch) throw new Error(`importChunk: load batch: ${be?.message ?? "not found"}`);
  if (batch.status !== "pending") {
    throw new Error(`importChunk: batch is ${batch.status}, not pending`);
  }

  const mapping = batch.mapping as Mapping;
  const { rows: normalized, errors: normalizeErrors } = normalizeRows(
    input.rows,
    mapping,
  );

  const [doneeIndex, dedupIndex, taxonomy] = await Promise.all([
    loadDoneeIndex(supabase, batch.source_name),
    loadDedupIndex(supabase),
    loadTaxonomyCache(supabase),
  ]);

  const result = await applyChunk(
    {
      supabase,
      doneeIndex,
      dedupIndex,
      taxonomy,
      mapping,
      sourceName: batch.source_name,
      importBatchId: batch.id,
      createdBy: admin.id,
    },
    normalized,
  );

  // Combine with any prior normalize errors from this chunk.
  result.errors.push(...normalizeErrors);

  // Update batch counters + error log (capped at 100 entries).
  const prevErrors = Array.isArray(batch.error_log) ? batch.error_log : [];
  const nextErrors = [...prevErrors, ...result.errors].slice(0, 100);
  const skippedThisChunk = normalizeErrors.length + result.errors.filter(
    (e) => !normalizeErrors.includes(e),
  ).length;

  const { error: ue } = await supabase
    .from("import_batches")
    .update({
      rows_inserted: batch.rows_inserted + result.inserted,
      rows_skipped: batch.rows_skipped + skippedThisChunk,
      rows_duplicate: batch.rows_duplicate + result.duplicates,
      error_log: nextErrors,
    })
    .eq("id", input.batchId);
  if (ue) throw new Error(`importChunk: update batch: ${ue.message}`);

  return result;
}

export async function finalizeBatch(batchId: string): Promise<void> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("import_batches")
    .update({ status: "applied", applied_at: new Date().toISOString() })
    .eq("id", batchId)
    .eq("status", "pending");
  if (error) throw new Error(`finalizeBatch: ${error.message}`);
  revalidatePath("/admin/import");
  revalidatePath("/admin/import/history");
  revalidatePath("/");
  revalidatePath("/report");
  revalidatePath("/donors");
}

export async function failBatch(batchId: string, reason: string): Promise<void> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("import_batches")
    .update({
      status: "failed",
      error_log: [{ rowIndex: -1, reason }],
    })
    .eq("id", batchId);
  if (error) throw new Error(`failBatch: ${error.message}`);
}

export async function revertBatch(batchId: string): Promise<{ deleted: number }> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { count, error: ce } = await supabase
    .from("donations")
    .delete({ count: "exact" })
    .eq("import_batch_id", batchId);
  if (ce) throw new Error(`revertBatch: delete donations: ${ce.message}`);

  const { error: ue } = await supabase
    .from("import_batches")
    .update({ status: "reverted" })
    .eq("id", batchId);
  if (ue) throw new Error(`revertBatch: update batch: ${ue.message}`);

  revalidatePath("/admin/import");
  revalidatePath("/admin/import/history");
  revalidatePath("/");
  revalidatePath("/report");
  revalidatePath("/donors");
  return { deleted: count ?? 0 };
}

// --- Saved mappings ---

export async function loadSavedMapping(sourceName: string): Promise<Mapping | null> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("import_field_mappings")
    .select("mapping")
    .eq("source_name", sourceName)
    .maybeSingle();
  if (error) throw new Error(`loadSavedMapping: ${error.message}`);
  return (data?.mapping as Mapping | undefined) ?? null;
}

export async function saveSavedMapping(input: {
  sourceName: string;
  mapping: Mapping;
}): Promise<void> {
  const admin = await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("import_field_mappings")
    .upsert(
      {
        source_name: input.sourceName,
        mapping: input.mapping,
        updated_by: admin.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,source_name" },
    );
  if (error) throw new Error(`saveSavedMapping: ${error.message}`);
}

// --- Lists for the history page ---

export type BatchSummary = {
  id: string;
  source_name: string;
  file_name: string;
  status: "pending" | "applied" | "failed" | "reverted";
  rows_total: number;
  rows_inserted: number;
  rows_skipped: number;
  rows_duplicate: number;
  created_at: string;
  applied_at: string | null;
};

export async function listBatches(): Promise<BatchSummary[]> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select(
      "id, source_name, file_name, status, rows_total, rows_inserted, rows_skipped, rows_duplicate, created_at, applied_at",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listBatches: ${error.message}`);
  return (data ?? []) as BatchSummary[];
}

// File-hash check: warn the user that a file with the same bytes was
// already uploaded.
export async function findPriorBatchByHash(fileHash: string): Promise<BatchSummary | null> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select(
      "id, source_name, file_name, status, rows_total, rows_inserted, rows_skipped, rows_duplicate, created_at, applied_at",
    )
    .eq("file_hash", fileHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`findPriorBatchByHash: ${error.message}`);
  return (data as BatchSummary | null) ?? null;
}
