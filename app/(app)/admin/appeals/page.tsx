import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  addAppeal,
  archiveAppeal,
  restoreAppeal,
} from "@/app/(app)/admin/actions";

type AppealRow = {
  id: string;
  name: string;
  archived_at: string | null;
};

export default async function AppealsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: appeals } = await supabase
    .from("appeals")
    .select("*")
    .order("archived_at", { nullsFirst: true })
    .order("name");

  async function add(fd: FormData) {
    "use server";
    await addAppeal({ name: String(fd.get("name") ?? "") });
  }
  async function archive(fd: FormData) {
    "use server";
    await archiveAppeal(String(fd.get("id")));
  }
  async function restore(fd: FormData) {
    "use server";
    await restoreAppeal(String(fd.get("id")));
  }

  return (
    <div className="animate-fade-in">
      <header className="mb-8">
        <h1 className="page-title">Appeals</h1>
        <p className="page-subtitle">
          The specific solicitation that produced the gift (e.g. &ldquo;Lent
          2026 Mailing&rdquo;, &ldquo;Giving Tuesday Email&rdquo;).
        </p>
      </header>

      <div className="card p-6 mb-6">
        <form action={add} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[240px]">
            <label htmlFor="appeal-name" className="label">
              New appeal name
            </label>
            <input
              id="appeal-name"
              name="name"
              required
              placeholder="Lent 2026 Mailing"
              className="input"
            />
          </div>
          <button className="btn-primary">Add appeal</button>
        </form>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50/60 border-b border-stone-200">
              <tr className="text-[11px] uppercase tracking-wider text-stone-500">
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {((appeals ?? []) as AppealRow[]).map((a) => (
                <tr key={a.id} className="hover:bg-stone-50/60 transition-colors">
                  <td className={`px-4 py-3 font-medium ${a.archived_at ? "text-stone-400" : "text-stone-900"}`}>
                    {a.name}
                  </td>
                  <td className="px-4 py-3">
                    {a.archived_at ? (
                      <span className="chip-neutral">archived</span>
                    ) : (
                      <span className="chip border bg-emerald-50 text-emerald-700 border-emerald-200">
                        active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      {!a.archived_at ? (
                        <form action={archive}>
                          <input type="hidden" name="id" value={a.id} />
                          <button className="btn-secondary btn-sm">Archive</button>
                        </form>
                      ) : (
                        <form action={restore}>
                          <input type="hidden" name="id" value={a.id} />
                          <button className="btn-secondary btn-sm">Restore</button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {(!appeals || appeals.length === 0) && (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-sm text-stone-500">
                    No appeals yet. Add one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
