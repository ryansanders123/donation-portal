import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addFund, archiveFund } from "@/app/(app)/admin/actions";

export default async function FundsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: funds } = await supabase
    .from("funds")
    .select("*")
    .order("archived_at", { nullsFirst: true })
    .order("name");

  async function add(fd: FormData) {
    "use server";
    await addFund({ name: String(fd.get("name") ?? "") });
  }
  async function archive(fd: FormData) {
    "use server";
    await archiveFund(String(fd.get("id")));
  }

  return (
    <div className="animate-fade-in">
      <header className="mb-8">
        <h1 className="page-title">Funds</h1>
        <p className="page-subtitle">
          Add or archive the designated funds donors can give toward.
        </p>
      </header>

      <div className="card p-6 mb-6">
        <form action={add} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[240px]">
            <label htmlFor="fund-name" className="label">
              New fund name
            </label>
            <input
              id="fund-name"
              name="name"
              required
              placeholder="General Fund"
              className="input"
            />
          </div>
          <button className="btn-primary">Add fund</button>
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
              {(funds ?? []).map(
                (f: {
                  id: string;
                  name: string;
                  archived_at: string | null;
                }) => (
                  <tr
                    key={f.id}
                    className="hover:bg-stone-50/60 transition-colors"
                  >
                    <td
                      className={`px-4 py-3 font-medium ${
                        f.archived_at ? "text-stone-400" : "text-stone-900"
                      }`}
                    >
                      {f.name}
                    </td>
                    <td className="px-4 py-3">
                      {f.archived_at ? (
                        <span className="chip-neutral">archived</span>
                      ) : (
                        <span className="chip border bg-emerald-50 text-emerald-700 border-emerald-200">
                          active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        {!f.archived_at && (
                          <form action={archive}>
                            <input type="hidden" name="id" value={f.id} />
                            <button className="btn-secondary btn-sm">
                              Archive
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              )}
              {(!funds || funds.length === 0) && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-12 text-center text-sm text-stone-500"
                  >
                    No funds yet. Add one above.
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
