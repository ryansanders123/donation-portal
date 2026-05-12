import { hasFeature, getActiveOrg } from "@/lib/org-context";
import { getDupCandidatesForDonee } from "@/lib/dedup";
import { DedupPairCard } from "@/components/DedupPairCard";

// Server component embedded at the top of /donors/[id]. Returns null
// (renders nothing) when the org has dedup turned off OR there are no
// candidate matches for this donee. The card component is shared with
// the admin queue, so action buttons + merge modal behave identically.
export async function DonorDupPanel({ doneeId }: { doneeId: string }) {
  const org = await getActiveOrg();
  if (!hasFeature(org, "dedup")) return null;

  const pairs = await getDupCandidatesForDonee(doneeId, { limit: 3, minScore: 0.4 });
  if (pairs.length === 0) return null;

  return (
    <section className="mb-6 rounded-lg border border-amber-200 bg-amber-50/40 p-4">
      <header className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="font-semibold text-amber-900">Possible duplicates</h2>
          <p className="text-xs text-amber-800/80">
            We found {pairs.length} other donor record{pairs.length === 1 ? "" : "s"} that may be the same
            person. Merge to consolidate, or mark as &ldquo;Not a match&rdquo; to hide the suggestion permanently.
          </p>
        </div>
      </header>
      <div className="space-y-2 bg-white/60 p-2 rounded">
        {pairs.map((p) => (
          <DedupPairCard key={`${p.a.id}-${p.b.id}`} pair={p} />
        ))}
      </div>
    </section>
  );
}
