import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  addCampaign,
  archiveCampaign,
  restoreCampaign,
} from "@/app/(app)/admin/actions";

type CampaignRow = {
  id: string;
  name: string;
  goal_amount: string | null;
  start_date: string | null;
  end_date: string | null;
  archived_at: string | null;
};

export default async function CampaignsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("*")
    .order("archived_at", { nullsFirst: true })
    .order("name");

  async function add(fd: FormData) {
    "use server";
    await addCampaign({
      name: String(fd.get("name") ?? ""),
      goal_amount: String(fd.get("goal_amount") ?? ""),
      start_date: String(fd.get("start_date") ?? ""),
      end_date: String(fd.get("end_date") ?? ""),
    });
  }
  async function archive(fd: FormData) {
    "use server";
    await archiveCampaign(String(fd.get("id")));
  }
  async function restore(fd: FormData) {
    "use server";
    await restoreCampaign(String(fd.get("id")));
  }

  return (
    <div className="animate-fade-in">
      <header className="mb-8">
        <h1 className="page-title">Campaigns</h1>
        <p className="page-subtitle">
          The big-picture goal money is being raised toward (e.g. &ldquo;FY26
          Annual Fund&rdquo;, &ldquo;Capital Drive&rdquo;).
        </p>
      </header>

      <div className="card p-6 mb-6">
        <form action={add} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="md:col-span-2">
            <label htmlFor="campaign-name" className="label">
              Name
            </label>
            <input
              id="campaign-name"
              name="name"
              required
              placeholder="FY26 Annual Fund"
              className="input"
            />
          </div>
          <div>
            <label htmlFor="goal_amount" className="label">
              Goal <span className="font-normal text-stone-400">(USD, optional)</span>
            </label>
            <input
              id="goal_amount"
              name="goal_amount"
              inputMode="decimal"
              pattern="\d+(\.\d{1,2})?"
              placeholder="50000"
              className="input"
            />
          </div>
          <div className="md:col-span-2 grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="start_date" className="label">
                Start <span className="font-normal text-stone-400">(opt)</span>
              </label>
              <input id="start_date" name="start_date" type="date" className="input" />
            </div>
            <div>
              <label htmlFor="end_date" className="label">
                End <span className="font-normal text-stone-400">(opt)</span>
              </label>
              <input id="end_date" name="end_date" type="date" className="input" />
            </div>
          </div>
          <div className="md:col-span-2 flex justify-end">
            <button className="btn-primary">Add campaign</button>
          </div>
        </form>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50/60 border-b border-stone-200">
              <tr className="text-[11px] uppercase tracking-wider text-stone-500">
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-right px-4 py-3 font-medium">Goal</th>
                <th className="text-left px-4 py-3 font-medium">Window</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {((campaigns ?? []) as CampaignRow[]).map((c) => (
                <tr key={c.id} className="hover:bg-stone-50/60 transition-colors">
                  <td className={`px-4 py-3 font-medium ${c.archived_at ? "text-stone-400" : "text-stone-900"}`}>
                    {c.name}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-stone-700">
                    {c.goal_amount ? `$${Number(c.goal_amount).toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {c.start_date || c.end_date
                      ? `${c.start_date ?? "…"} → ${c.end_date ?? "…"}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {c.archived_at ? (
                      <span className="chip-neutral">archived</span>
                    ) : (
                      <span className="chip border bg-emerald-50 text-emerald-700 border-emerald-200">
                        active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      {!c.archived_at ? (
                        <form action={archive}>
                          <input type="hidden" name="id" value={c.id} />
                          <button className="btn-secondary btn-sm">Archive</button>
                        </form>
                      ) : (
                        <form action={restore}>
                          <input type="hidden" name="id" value={c.id} />
                          <button className="btn-secondary btn-sm">Restore</button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {(!campaigns || campaigns.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-stone-500">
                    No campaigns yet. Add one above.
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
