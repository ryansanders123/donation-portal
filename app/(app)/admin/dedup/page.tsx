import Link from "next/link";
import { requireFeature } from "@/lib/org-context";
import { getDupCandidates } from "@/lib/dedup";
import { DedupPairCard } from "@/components/DedupPairCard";

export default async function DedupPage() {
  await requireFeature("dedup");
  const pairs = await getDupCandidates({ limit: 100, minScore: 0.4 });

  return (
    <div className="animate-fade-in max-w-4xl">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Duplicate donors</h1>
          <p className="page-subtitle">
            Candidate pairs ranked by confidence. Merge to combine them, or mark as &ldquo;Not a match&rdquo;
            to permanently hide the suggestion.
          </p>
        </div>
        <Link href="/admin/dedup/history" className="btn-secondary">Merge history</Link>
      </header>

      {pairs.length === 0 ? (
        <div className="card p-10 text-center text-stone-500">
          No suspected duplicates above 0.4 confidence.
        </div>
      ) : (
        <>
          <p className="text-xs text-stone-500 mb-3">
            Showing {pairs.length} pair{pairs.length === 1 ? "" : "s"}. Sorted by confidence.
          </p>
          {pairs.map((p) => (
            <DedupPairCard key={`${p.a.id}-${p.b.id}`} pair={p} />
          ))}
        </>
      )}
    </div>
  );
}
