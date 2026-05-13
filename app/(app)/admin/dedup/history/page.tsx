import { createSupabaseServerClient } from "@/lib/supabase/server";
import { undoMerge } from "@/lib/dedup-actions";

type MergeRow = {
  id: string;
  winner_id: string | null;
  loser_id: string;
  snapshot: {
    winner_before?: { name?: string };
    loser_before?: { name?: string };
  };
  donations_moved: number;
  merged_at: string;
  undone_at: string | null;
  merged_by_email?: string | null;
  winner_name_now?: string | null;
};

export default async function DedupHistoryPage() {
  const supabase = await createSupabaseServerClient();

  const { data: rawMerges } = await supabase
    .from("donee_merges")
    .select("id, winner_id, loser_id, snapshot, donations_moved, merged_at, undone_at, merged_by")
    .order("merged_at", { ascending: false })
    .limit(200);

  const merges = (rawMerges ?? []) as Array<{
    id: string;
    winner_id: string | null;
    loser_id: string;
    snapshot: MergeRow["snapshot"];
    donations_moved: number;
    merged_at: string;
    undone_at: string | null;
    merged_by: string | null;
  }>;

  // Hydrate current winner names + actor emails.
  const winnerIds = merges.map((m) => m.winner_id).filter((x): x is string => !!x);
  const actorIds = merges.map((m) => m.merged_by).filter((x): x is string => !!x);
  const [{ data: winners }, { data: actors }] = await Promise.all([
    winnerIds.length
      ? supabase.from("donees").select("id, name").in("id", winnerIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    actorIds.length
      ? supabase.from("users").select("id, email").in("id", actorIds)
      : Promise.resolve({ data: [] as { id: string; email: string }[] }),
  ]);
  const winnerMap = new Map((winners ?? []).map((w) => [w.id, w.name]));
  const actorMap = new Map((actors ?? []).map((u) => [u.id, u.email]));

  async function doUndo(fd: FormData) {
    "use server";
    await undoMerge(String(fd.get("merge_id") ?? ""));
  }

  return (
    <div className="animate-fade-in max-w-5xl">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Merge history</h1>
          <p className="page-subtitle">
            Past donor merges, newest first. Undo restores the losing donor and moves their donations back.
          </p>
        </div>
        <a href="/admin/dedup" className="btn-secondary">Back to dedup</a>
      </header>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50/60 border-b border-stone-200">
              <tr className="text-[11px] uppercase tracking-wider text-stone-500">
                <th className="text-left px-4 py-3 font-medium">When</th>
                <th className="text-left px-4 py-3 font-medium">By</th>
                <th className="text-left px-4 py-3 font-medium">Winner (kept)</th>
                <th className="text-left px-4 py-3 font-medium">Loser (deleted)</th>
                <th className="text-right px-4 py-3 font-medium">Donations moved</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {merges.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-stone-500">
                    No merges yet.
                  </td>
                </tr>
              )}
              {merges.map((m) => {
                const winnerNow = m.winner_id ? winnerMap.get(m.winner_id) : null;
                const cascadeMerged = m.winner_id !== null && !winnerNow;
                const winnerLabel =
                  winnerNow ?? m.snapshot?.winner_before?.name ?? "(unknown)";
                const loserLabel = m.snapshot?.loser_before?.name ?? "(unknown)";
                const actor = m.merged_by ? actorMap.get(m.merged_by) ?? "(unknown)" : "(unknown)";

                let status: { label: string; cls: string };
                if (m.undone_at) {
                  status = { label: "undone", cls: "bg-stone-100 text-stone-600 border-stone-200" };
                } else if (cascadeMerged) {
                  status = { label: "cascade", cls: "bg-amber-50 text-amber-800 border-amber-200" };
                } else {
                  status = { label: "applied", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
                }
                const canUndo = !m.undone_at && !cascadeMerged && m.winner_id !== null;

                return (
                  <tr key={m.id} className="hover:bg-stone-50/60">
                    <td className="px-4 py-3 whitespace-nowrap text-stone-700">
                      {new Date(m.merged_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-stone-600">{actor}</td>
                    <td className="px-4 py-3 font-medium">{winnerLabel}</td>
                    <td className="px-4 py-3 text-stone-700">{loserLabel}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{m.donations_moved}</td>
                    <td className="px-4 py-3">
                      <span className={`chip border ${status.cls}`}>{status.label}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canUndo ? (
                        <form action={doUndo}>
                          <input type="hidden" name="merge_id" value={m.id} />
                          <button className="btn-secondary btn-sm">Undo</button>
                        </form>
                      ) : (
                        <span
                          className="text-xs text-stone-400"
                          title={cascadeMerged ? "Winner was merged into another donor" : "Already undone"}
                        >
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
