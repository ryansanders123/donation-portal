"use client";

import { useState, useTransition } from "react";
import type { DupCandidatePair, DoneeDetail } from "@/lib/dedup";
import { mergeDonees, rejectDupPair, type MergedFields } from "@/lib/dedup-actions";

const FIELD_LABELS: { key: keyof MergedFields; label: string; required?: boolean }[] = [
  { key: "name", label: "Name", required: true },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "address_line1", label: "Address line 1" },
  { key: "address_line2", label: "Address line 2" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "Zip" },
];

function pickInitial(a: string | null, b: string | null): "a" | "b" {
  if (a && !b) return "a";
  if (!a && b) return "b";
  return "a";
}

export function DedupPairCard({ pair }: { pair: DupCandidatePair }) {
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (hidden) return null;

  function onReject() {
    setError(null);
    startTransition(async () => {
      try {
        await rejectDupPair({ idA: pair.a.id, idB: pair.b.id });
        setHidden(true);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function onSkip() {
    setHidden(true);
  }

  return (
    <div className="card p-4 mb-3 border-stone-200">
      <div className="flex items-start gap-3 mb-3">
        <ConfidenceChip score={pair.score} reasons={pair.reasons} />
        <div className="ml-auto flex gap-2">
          <button className="btn-secondary btn-sm" onClick={() => setOpen(true)} disabled={pending}>
            Merge…
          </button>
          <button className="btn-secondary btn-sm" onClick={onReject} disabled={pending}>
            Not a match
          </button>
          <button className="btn-ghost btn-sm" onClick={onSkip} disabled={pending}>
            Skip
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <DonorBox donor={pair.a} />
        <DonorBox donor={pair.b} />
      </div>

      {error && (
        <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      {open && (
        <MergeModal
          pair={pair}
          onClose={() => setOpen(false)}
          onMerged={() => {
            setOpen(false);
            setHidden(true);
          }}
        />
      )}
    </div>
  );
}

function ConfidenceChip({ score, reasons }: { score: number; reasons: string[] }) {
  const colorClass =
    score >= 0.9
      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
      : score >= 0.7
      ? "bg-amber-50 border-amber-200 text-amber-800"
      : "bg-stone-50 border-stone-200 text-stone-700";
  return (
    <div className={`inline-flex flex-wrap items-center gap-2 px-2.5 py-1 rounded border text-xs ${colorClass}`}>
      <span className="font-mono font-semibold">{score.toFixed(2)}</span>
      <span className="text-stone-500">·</span>
      <span>{reasons.length ? reasons.join(" + ") : "name similarity"}</span>
    </div>
  );
}

function DonorBox({ donor }: { donor: DoneeDetail }) {
  return (
    <div className="rounded border border-stone-200 p-3 text-sm bg-stone-50/40">
      <div className="font-medium text-stone-900 mb-1">{donor.name}</div>
      <div className="text-xs text-stone-600 space-y-0.5">
        {donor.email && <div>{donor.email}</div>}
        {donor.phone && <div>{donor.phone}</div>}
        {(donor.address_line1 || donor.city) && (
          <div>
            {donor.address_line1}
            {donor.address_line2 ? `, ${donor.address_line2}` : ""}
            {donor.city ? `, ${donor.city}` : ""}
            {donor.state ? ` ${donor.state}` : ""}
            {donor.zip ? ` ${donor.zip}` : ""}
          </div>
        )}
      </div>
      <div className="mt-2 pt-2 border-t border-stone-200 text-xs text-stone-700 flex gap-3">
        <span><strong>{donor.donation_count}</strong> gift{donor.donation_count === 1 ? "" : "s"}</span>
        <span>
          <strong>${Number(donor.lifetime_total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> lifetime
        </span>
        {donor.last_gift_at && (
          <span className="text-stone-500">last {new Date(donor.last_gift_at).toLocaleDateString()}</span>
        )}
      </div>
    </div>
  );
}

function MergeModal({
  pair,
  onClose,
  onMerged,
}: {
  pair: DupCandidatePair;
  onClose: () => void;
  onMerged: () => void;
}) {
  // Default winner = whichever has more donations; tiebreak alphabetical for stable UX.
  const initialWinnerSide: "a" | "b" =
    pair.a.donation_count >= pair.b.donation_count ? "a" : "b";

  const [winnerSide, setWinnerSide] = useState<"a" | "b">(initialWinnerSide);
  const [picks, setPicks] = useState<Record<keyof MergedFields, "a" | "b" | "custom">>(
    () => {
      const out: Record<string, "a" | "b" | "custom"> = {};
      for (const f of FIELD_LABELS) out[f.key] = pickInitial(pair.a[f.key], pair.b[f.key]);
      return out as Record<keyof MergedFields, "a" | "b" | "custom">;
    },
  );
  const [custom, setCustom] = useState<Partial<Record<keyof MergedFields, string>>>({});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const winner = winnerSide === "a" ? pair.a : pair.b;
  const loser  = winnerSide === "a" ? pair.b : pair.a;

  function valueFor(side: "a" | "b", key: keyof MergedFields): string {
    const d = side === "a" ? pair.a : pair.b;
    return (d[key] ?? "") as string;
  }

  function resolved(key: keyof MergedFields): string | null {
    const p = picks[key];
    if (p === "custom") return (custom[key] ?? "").trim() || null;
    const v = valueFor(p, key);
    return v.trim() || null;
  }

  function onConfirm() {
    setError(null);
    const merged: MergedFields = {
      name: resolved("name") ?? "",
      email: resolved("email"),
      phone: resolved("phone"),
      address_line1: resolved("address_line1"),
      address_line2: resolved("address_line2"),
      city: resolved("city"),
      state: resolved("state"),
      zip: resolved("zip"),
    };
    if (!merged.name) {
      setError("Name is required.");
      return;
    }
    startTransition(async () => {
      try {
        await mergeDonees({ winnerId: winner.id, loserId: loser.id, merged });
        onMerged();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full my-4">
        <header className="px-5 py-3 border-b border-stone-200 flex items-center justify-between">
          <h2 className="font-semibold">Merge donors</h2>
          <button className="btn-ghost btn-sm" onClick={onClose} disabled={pending}>Cancel</button>
        </header>

        <div className="p-5 space-y-5">
          {/* Winner picker */}
          <div>
            <div className="label mb-2">Winner (the surviving record)</div>
            <div className="grid grid-cols-2 gap-3">
              {(["a", "b"] as const).map((side) => {
                const d = side === "a" ? pair.a : pair.b;
                const isW = side === winnerSide;
                return (
                  <label
                    key={side}
                    className={`flex items-start gap-2 p-3 border rounded cursor-pointer transition ${
                      isW ? "border-brand-400 bg-brand-50/40" : "border-stone-200 hover:border-stone-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="winner"
                      value={side}
                      checked={isW}
                      onChange={() => setWinnerSide(side)}
                      className="mt-1"
                    />
                    <div className="text-sm">
                      <div className="font-medium">{d.name}</div>
                      <div className="text-xs text-stone-500">{d.donation_count} gifts · ${Number(d.lifetime_total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Field picker */}
          <div>
            <div className="label mb-2">Field values (pick which side wins for each field, or type a custom value)</div>
            <div className="space-y-2">
              {FIELD_LABELS.map((f) => (
                <div key={f.key} className="grid grid-cols-12 gap-2 items-center text-sm">
                  <div className="col-span-12 sm:col-span-2 text-stone-700">
                    {f.label}{f.required && <span className="text-red-600 ml-0.5">*</span>}
                  </div>
                  {(["a", "b"] as const).map((side) => {
                    const v = valueFor(side, f.key);
                    const id = `${f.key}-${side}`;
                    return (
                      <label
                        key={side}
                        htmlFor={id}
                        className={`col-span-12 sm:col-span-4 flex items-center gap-2 p-2 border rounded cursor-pointer ${
                          picks[f.key] === side
                            ? "border-brand-400 bg-brand-50/40"
                            : "border-stone-200 hover:border-stone-300"
                        }`}
                      >
                        <input
                          id={id}
                          type="radio"
                          name={`field-${f.key}`}
                          checked={picks[f.key] === side}
                          onChange={() => setPicks((p) => ({ ...p, [f.key]: side }))}
                        />
                        <span className={v ? "text-stone-800" : "text-stone-400 italic"}>
                          {v || "(empty)"}
                        </span>
                      </label>
                    );
                  })}
                  <div className="col-span-12 sm:col-span-2">
                    <input
                      type="text"
                      placeholder="custom"
                      value={custom[f.key] ?? ""}
                      onFocus={() => setPicks((p) => ({ ...p, [f.key]: "custom" }))}
                      onChange={(e) => setCustom((c) => ({ ...c, [f.key]: e.target.value }))}
                      className={`input text-xs px-2 py-1 ${
                        picks[f.key] === "custom" ? "ring-2 ring-brand-300" : ""
                      }`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded bg-amber-50 border border-amber-200 text-amber-900 text-sm px-3 py-2">
            This will move <strong>{loser.donation_count}</strong> donations from{" "}
            <strong>{loser.name}</strong> into <strong>{winner.name}</strong> and permanently delete{" "}
            <strong>{loser.name}</strong>. A snapshot is recorded so the merge can be undone from the history page.
          </div>

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-stone-200 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose} disabled={pending}>Cancel</button>
          <button className="btn-primary" onClick={onConfirm} disabled={pending}>
            {pending ? "Merging…" : "Confirm merge"}
          </button>
        </footer>
      </div>
    </div>
  );
}
