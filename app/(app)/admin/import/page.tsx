"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import { autoDetect, detectionsToMapping } from "@/lib/import/autoDetect";
import type {
  ApplyChunkResult,
  Mapping,
  RawRow,
  TargetField,
  ValidateSummary,
} from "@/lib/import/types";
import {
  createBatch,
  failBatch,
  finalizeBatch,
  findPriorBatchByHash,
  importChunk,
  loadSavedMapping,
  saveSavedMapping,
  validateBatch,
} from "./actions";

type Step = "upload" | "map" | "preview" | "importing" | "result";

const FIELD_GROUPS: { label: string; fields: TargetField[] }[] = [
  {
    label: "Donation",
    fields: [
      "amount",
      "date_received",
      "type",
      "external_id",
      "check_number",
      "reference_id",
      "fund_name",
      "campaign_name",
      "appeal_name",
      "note",
    ],
  },
  {
    label: "Donor",
    fields: [
      "donor_name",
      "donor_first_name",
      "donor_last_name",
      "donor_company",
      "donor_email",
      "donor_phone",
      "donor_address_line1",
      "donor_address_line2",
      "donor_city",
      "donor_state",
      "donor_zip",
      "donor_external_id",
    ],
  },
];

const REQUIRED_FIELDS: TargetField[] = ["amount", "date_received"];

const CHUNK_SIZE = 500;

async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function ImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<{
    name: string;
    size: number;
    hash: string;
  } | null>(null);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [sourceName, setSourceName] = useState("");
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [saveMapping, setSaveMapping] = useState(true);
  const [validation, setValidation] = useState<ValidateSummary | null>(null);
  const [priorBatch, setPriorBatch] = useState<{ created_at: string; file_name: string } | null>(null);

  const [batchId, setBatchId] = useState<string | null>(null);
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const [finalResult, setFinalResult] = useState<{
    inserted: number;
    duplicates: number;
    skipped: number;
    doneesCreated: number;
    doneesMatched: number;
    errors: { rowIndex: number; reason: string }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // --- Step 1: Upload ---
  async function onFile(f: File) {
    setError(null);
    const text = await f.text();
    const hash = await sha256Hex(text);

    const parsed = Papa.parse<RawRow>(text, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      transform: (v) => (typeof v === "string" ? v.trim() : v),
      dynamicTyping: false,
    });

    if (parsed.errors.length && parsed.data.length === 0) {
      setError(`CSV parse error: ${parsed.errors[0].message}`);
      return;
    }

    const headers = parsed.meta.fields ?? [];
    const rows = parsed.data as RawRow[];

    setFile({ name: f.name, size: f.size, hash });
    setRawHeaders(headers);
    setRawRows(rows);

    const detections = autoDetect(headers);
    const guessedMapping = detectionsToMapping(detections);
    setMapping(guessedMapping);

    // Guess source name from the filename (e.g. "GiveCentral.csv" → "GiveCentral").
    setSourceName(f.name.replace(/\.csv$/i, "").replace(/[_-]/g, " "));

    // Check for prior identical upload.
    try {
      const prior = await findPriorBatchByHash(hash);
      if (prior) setPriorBatch({ created_at: prior.created_at, file_name: prior.file_name });
      else setPriorBatch(null);
    } catch {
      setPriorBatch(null);
    }

    setStep("map");
  }

  // --- Step 2: Map ---
  function setColumnFor(field: TargetField, column: string) {
    setMapping((m) => {
      if (!m) return m;
      const columns = { ...m.columns };
      if (column === "") delete columns[field];
      else columns[field] = column;
      return { ...m, columns };
    });
  }
  function setTypeConstant(value: "" | "cash" | "check" | "online") {
    setMapping((m) => {
      if (!m) return m;
      const constants = { ...m.constants };
      if (value === "") delete constants.type;
      else constants.type = value;
      return { ...m, constants };
    });
  }
  function toggleMatchByAddress(v: boolean) {
    setMapping((m) => (m ? { ...m, matchDoneeByNameAddress: v } : m));
  }

  const requiredMissing = useMemo(() => {
    if (!mapping) return REQUIRED_FIELDS;
    return REQUIRED_FIELDS.filter((f) => !mapping.columns[f]);
  }, [mapping]);
  const taxonomyMapped = useMemo(() => {
    if (!mapping) return false;
    return !!(
      mapping.columns.fund_name ||
      mapping.columns.campaign_name ||
      mapping.columns.appeal_name
    );
  }, [mapping]);
  const donorIdentityMapped = useMemo(() => {
    if (!mapping) return false;
    return !!(
      mapping.columns.donor_name ||
      mapping.columns.donor_company ||
      (mapping.columns.donor_first_name && mapping.columns.donor_last_name) ||
      mapping.columns.donor_email
    );
  }, [mapping]);

  const mapStepReady = requiredMissing.length === 0 && taxonomyMapped && donorIdentityMapped && !!sourceName.trim();

  async function applySavedMapping() {
    if (!sourceName.trim()) return;
    const saved = await loadSavedMapping(sourceName.trim());
    if (saved) setMapping(saved);
    else alert(`No saved mapping for "${sourceName}".`);
  }

  // --- Step 3: Preview ---
  async function onValidate() {
    if (!mapping) return;
    setError(null);
    try {
      const v = await validateBatch({
        rows: rawRows,
        mapping,
        sourceName: sourceName.trim(),
      });
      setValidation(v);
      setStep("preview");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // --- Step 4: Confirm / Import ---
  async function onConfirm() {
    if (!file || !mapping) return;
    setError(null);
    setStep("importing");
    setProgress({ processed: 0, total: rawRows.length });
    let activeBatchId: string | null = null;

    try {
      const { batchId: bid } = await createBatch({
        sourceName: sourceName.trim(),
        fileName: file.name,
        fileSize: file.size,
        fileHash: file.hash,
        mapping,
        rowsTotal: rawRows.length,
      });
      activeBatchId = bid;
      setBatchId(bid);

      if (saveMapping) {
        try {
          await saveSavedMapping({ sourceName: sourceName.trim(), mapping });
        } catch {
          // Saved-mapping failure shouldn't abort the import.
        }
      }

      const totals = {
        inserted: 0,
        duplicates: 0,
        skipped: 0,
        doneesCreated: 0,
        doneesMatched: 0,
        errors: [] as { rowIndex: number; reason: string }[],
      };

      for (let i = 0; i < rawRows.length; i += CHUNK_SIZE) {
        const chunk = rawRows.slice(i, i + CHUNK_SIZE);
        const result: ApplyChunkResult = await importChunk({
          batchId: bid,
          rows: chunk,
        });
        totals.inserted += result.inserted;
        totals.duplicates += result.duplicates;
        totals.skipped += result.errors.length;
        totals.doneesCreated += result.doneesCreated;
        totals.doneesMatched += result.doneesMatched;
        if (totals.errors.length < 100) {
          totals.errors.push(
            ...result.errors.slice(0, 100 - totals.errors.length),
          );
        }
        setProgress({ processed: Math.min(i + CHUNK_SIZE, rawRows.length), total: rawRows.length });
      }

      await finalizeBatch(bid);
      setFinalResult(totals);
      setStep("result");
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      if (activeBatchId) {
        try { await failBatch(activeBatchId, msg); } catch {}
      }
      setStep("result");
    }
  }

  function resetAll() {
    setStep("upload");
    setFile(null);
    setRawHeaders([]);
    setRawRows([]);
    setSourceName("");
    setMapping(null);
    setValidation(null);
    setBatchId(null);
    setProgress({ processed: 0, total: 0 });
    setFinalResult(null);
    setError(null);
    setPriorBatch(null);
  }

  return (
    <div className="animate-fade-in max-w-5xl">
      <header className="mb-6">
        <h1 className="page-title">Import donations</h1>
        <p className="page-subtitle">
          Upload a CSV from any source — GiveCentral, Bloomerang, your bank&apos;s
          export, a hand-rolled Excel sheet — and we&apos;ll match donors and
          insert donations into this organization.
        </p>
      </header>

      <Stepper step={step} />

      {error && (
        <div className="card p-4 mb-4 border-red-200 bg-red-50 text-sm text-red-800">
          {error}
        </div>
      )}

      {step === "upload" && <UploadStep onFile={onFile} />}

      {step === "map" && mapping && (
        <MapStep
          headers={rawHeaders}
          rowsSample={rawRows.slice(0, 5)}
          file={file!}
          sourceName={sourceName}
          setSourceName={setSourceName}
          mapping={mapping}
          setColumnFor={setColumnFor}
          setTypeConstant={setTypeConstant}
          toggleMatchByAddress={toggleMatchByAddress}
          applySavedMapping={applySavedMapping}
          saveMapping={saveMapping}
          setSaveMapping={setSaveMapping}
          priorBatch={priorBatch}
          requiredMissing={requiredMissing}
          taxonomyMapped={taxonomyMapped}
          donorIdentityMapped={donorIdentityMapped}
          mapStepReady={mapStepReady}
          onValidate={onValidate}
          onBack={() => setStep("upload")}
        />
      )}

      {step === "preview" && validation && (
        <PreviewStep
          validation={validation}
          rowsTotal={rawRows.length}
          onConfirm={onConfirm}
          onBack={() => setStep("map")}
        />
      )}

      {step === "importing" && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-3">Importing…</h2>
          <p className="text-sm text-stone-600 mb-4">
            Processed {progress.processed} of {progress.total} rows.
          </p>
          <div className="w-full bg-stone-100 rounded h-2 overflow-hidden">
            <div
              className="bg-brand-600 h-2 transition-all"
              style={{
                width: progress.total
                  ? `${Math.round((progress.processed / progress.total) * 100)}%`
                  : "0%",
              }}
            />
          </div>
        </div>
      )}

      {step === "result" && finalResult && (
        <ResultStep
          result={finalResult}
          fileName={file?.name ?? "(unknown)"}
          onStartOver={resetAll}
          batchId={batchId}
        />
      )}
    </div>
  );
}

// -------------------- Sub-components --------------------

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "map", label: "Map" },
    { key: "preview", label: "Preview" },
    { key: "result", label: "Result" },
  ];
  const activeIdx = steps.findIndex(
    (s) => s.key === step || (step === "importing" && s.key === "preview"),
  );
  return (
    <ol className="flex items-center gap-3 mb-6 text-sm">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2">
          <span
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-medium ${
              i <= activeIdx
                ? "bg-brand-600 border-brand-600 text-white"
                : "border-stone-300 text-stone-500"
            }`}
          >
            {i + 1}
          </span>
          <span className={i === activeIdx ? "font-medium text-stone-900" : "text-stone-500"}>
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="text-stone-300">→</span>}
        </li>
      ))}
    </ol>
  );
}

function UploadStep({ onFile }: { onFile: (f: File) => void }) {
  const [dragging, setDragging] = useState(false);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  }

  return (
    <div className="card p-8">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`block border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition ${
          dragging ? "border-brand-500 bg-brand-50" : "border-stone-300 hover:border-stone-400"
        }`}
      >
        <p className="text-base font-medium text-stone-800">Drop a CSV here, or click to pick one</p>
        <p className="mt-2 text-sm text-stone-500">
          One row per transaction. Headers in the first row.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
      </label>
    </div>
  );
}

function MapStep(props: {
  headers: string[];
  rowsSample: RawRow[];
  file: { name: string; size: number; hash: string };
  sourceName: string;
  setSourceName: (s: string) => void;
  mapping: Mapping;
  setColumnFor: (f: TargetField, c: string) => void;
  setTypeConstant: (v: "" | "cash" | "check" | "online") => void;
  toggleMatchByAddress: (v: boolean) => void;
  applySavedMapping: () => Promise<void>;
  saveMapping: boolean;
  setSaveMapping: (v: boolean) => void;
  priorBatch: { created_at: string; file_name: string } | null;
  requiredMissing: TargetField[];
  taxonomyMapped: boolean;
  donorIdentityMapped: boolean;
  mapStepReady: boolean;
  onValidate: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold">{props.file.name}</h2>
          <div className="text-sm text-stone-500">
            {props.rowsSample.length > 0
              ? `${props.headers.length} columns, sample of first 5 shown`
              : ""}
          </div>
        </div>

        {props.priorBatch && (
          <div className="mb-4 text-sm rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
            An identical file ({props.priorBatch.file_name}) was uploaded on{" "}
            {new Date(props.priorBatch.created_at).toLocaleString()}. Re-importing
            will dedup by external_id; duplicates will be skipped.
          </div>
        )}

        <div className="overflow-x-auto border border-stone-200 rounded">
          <table className="w-full text-xs">
            <thead className="bg-stone-50">
              <tr>
                {props.headers.map((h) => (
                  <th key={h} className="px-2 py-1.5 text-left font-medium text-stone-600 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {props.rowsSample.map((r, i) => (
                <tr key={i} className="border-t border-stone-100">
                  {props.headers.map((h) => (
                    <td key={h} className="px-2 py-1 whitespace-nowrap text-stone-700">
                      {r[h] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-lg font-semibold mb-3">Source</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[260px]">
            <label className="label" htmlFor="source-name">Source name</label>
            <input
              id="source-name"
              className="input"
              placeholder="GiveCentral, Bloomerang, Manual…"
              value={props.sourceName}
              onChange={(e) => props.setSourceName(e.target.value)}
            />
            <p className="text-xs text-stone-500 mt-1">
              Used for dedup (external IDs are scoped per source) and for finding
              saved mappings on re-upload.
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={props.applySavedMapping}
            disabled={!props.sourceName.trim()}
          >
            Use saved mapping
          </button>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-lg font-semibold mb-3">Column mapping</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {FIELD_GROUPS.map((group) => (
            <div key={group.label}>
              <h3 className="text-sm font-semibold text-stone-600 mb-2">{group.label}</h3>
              <div className="space-y-1.5">
                {group.fields.map((f) => (
                  <div key={f} className="grid grid-cols-2 gap-2 items-center">
                    <label className="text-sm text-stone-700">
                      {fieldLabel(f)}
                      {REQUIRED_FIELDS.includes(f) && (
                        <span className="text-red-600 ml-0.5">*</span>
                      )}
                    </label>
                    <select
                      className="input"
                      value={props.mapping.columns[f] ?? ""}
                      onChange={(e) => props.setColumnFor(f, e.target.value)}
                    >
                      <option value="">— not mapped —</option>
                      {props.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-3 border-t border-stone-200 pt-4">
          <div className="grid grid-cols-2 gap-2 items-center max-w-md">
            <label className="text-sm text-stone-700">Default donation type</label>
            <select
              className="input"
              value={props.mapping.constants.type ?? ""}
              onChange={(e) =>
                props.setTypeConstant(e.target.value as "" | "cash" | "check" | "online")
              }
            >
              <option value="cash">cash</option>
              <option value="check">check</option>
              <option value="online">online</option>
              <option value="">(use mapped column)</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={props.mapping.matchDoneeByNameAddress}
              onChange={(e) => props.toggleMatchByAddress(e.target.checked)}
            />
            Also match donors by name + zip + address (waterfall step 3)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={props.saveMapping}
              onChange={(e) => props.setSaveMapping(e.target.checked)}
            />
            Save this mapping for future {props.sourceName || "this source"} imports
          </label>
        </div>
      </div>

      {!props.mapStepReady && (
        <div className="card p-4 border-amber-200 bg-amber-50 text-sm text-amber-900">
          <p className="font-medium">Before you can preview:</p>
          <ul className="list-disc list-inside mt-1">
            {props.requiredMissing.map((f) => (
              <li key={f}>Map a column to <strong>{fieldLabel(f)}</strong></li>
            ))}
            {!props.taxonomyMapped && (
              <li>Map at least one of fund / campaign / appeal</li>
            )}
            {!props.donorIdentityMapped && (
              <li>Map a donor name, first+last, company, or email</li>
            )}
            {!props.sourceName.trim() && <li>Enter a source name</li>}
          </ul>
        </div>
      )}

      <div className="flex justify-between">
        <button className="btn-secondary" onClick={props.onBack}>Back</button>
        <button
          className="btn-primary"
          onClick={props.onValidate}
          disabled={!props.mapStepReady}
        >
          Preview impact
        </button>
      </div>
    </div>
  );
}

function PreviewStep(props: {
  validation: ValidateSummary;
  rowsTotal: number;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const v = props.validation;
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="text-lg font-semibold mb-3">Dry-run impact</h2>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <Stat label="Rows in file" value={v.rowsTotal} />
          <Stat label="Would insert" value={v.wouldInsert} highlight />
          <Stat label="Duplicates (skipped)" value={v.wouldSkipDuplicate} />
          <Stat label="Errors (skipped)" value={v.wouldSkipError} />
          <Stat label="New donors" value={v.wouldCreateNewDonees} />
          <Stat label="Matched donors" value={v.wouldMatchExistingDonees} />
        </dl>

        {v.sampleErrors.length > 0 && (
          <div className="mt-5 border-t border-stone-200 pt-4">
            <h3 className="text-sm font-semibold text-stone-700 mb-2">
              First {v.sampleErrors.length} errors
            </h3>
            <ul className="text-xs text-stone-600 space-y-1">
              {v.sampleErrors.map((e, i) => (
                <li key={i}>
                  <span className="font-mono text-stone-500">row {e.rowIndex + 2}:</span>{" "}
                  {e.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button className="btn-secondary" onClick={props.onBack}>Back to mapping</button>
        <button
          className="btn-primary"
          onClick={props.onConfirm}
          disabled={v.wouldInsert === 0}
        >
          Import {v.wouldInsert} {v.wouldInsert === 1 ? "row" : "rows"}
        </button>
      </div>
    </div>
  );
}

function ResultStep(props: {
  result: {
    inserted: number;
    duplicates: number;
    skipped: number;
    doneesCreated: number;
    doneesMatched: number;
    errors: { rowIndex: number; reason: string }[];
  };
  fileName: string;
  onStartOver: () => void;
  batchId: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="text-lg font-semibold mb-3">Import complete</h2>
        <p className="text-sm text-stone-600 mb-4">{props.fileName}</p>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <Stat label="Inserted" value={props.result.inserted} highlight />
          <Stat label="Duplicates" value={props.result.duplicates} />
          <Stat label="Skipped (errors)" value={props.result.skipped} />
          <Stat label="New donors" value={props.result.doneesCreated} />
          <Stat label="Matched donors" value={props.result.doneesMatched} />
        </dl>

        {props.result.errors.length > 0 && (
          <div className="mt-5 border-t border-stone-200 pt-4">
            <h3 className="text-sm font-semibold text-stone-700 mb-2">
              First {Math.min(props.result.errors.length, 25)} errors
            </h3>
            <ul className="text-xs text-stone-600 space-y-1">
              {props.result.errors.slice(0, 25).map((e, i) => (
                <li key={i}>
                  <span className="font-mono text-stone-500">row {e.rowIndex + 2}:</span>{" "}
                  {e.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button className="btn-secondary" onClick={props.onStartOver}>
          Import another file
        </button>
        <a className="btn-primary" href="/admin/import/history">
          View import history
        </a>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${highlight ? "border-emerald-200 bg-emerald-50" : "border-stone-200"}`}>
      <div className="text-xs uppercase tracking-wider text-stone-500">{label}</div>
      <div className={`text-lg font-semibold ${highlight ? "text-emerald-700" : "text-stone-900"}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function fieldLabel(f: TargetField): string {
  return f
    .replace(/^donor_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
