import { createSupabaseServerClient } from "@/lib/supabase/server";
import { inviteUser, setUserRole, removeUser } from "@/app/(app)/admin/actions";

export default async function UsersPage() {
  const supabase = await createSupabaseServerClient();
  const { data: users } = await supabase
    .from("users")
    .select("id,email,role,last_login_at,removed_at,auth_user_id,platform_admin")
    .order("invited_at", { ascending: false });

  async function invite(fd: FormData) {
    "use server";
    await inviteUser({ email: String(fd.get("email") ?? "") });
  }
  async function promote(fd: FormData) {
    "use server";
    await setUserRole(String(fd.get("id")), "admin");
  }
  async function demote(fd: FormData) {
    "use server";
    await setUserRole(String(fd.get("id")), "user");
  }
  async function remove(fd: FormData) {
    "use server";
    await removeUser(String(fd.get("id")));
  }

  return (
    <div className="animate-fade-in">
      <header className="mb-8">
        <h1 className="font-serif text-3xl md:text-4xl text-stone-900 tracking-tight">
          Users
        </h1>
        <p className="mt-2 text-stone-600">
          Invite new members and manage access.
        </p>
      </header>

      <div className="card p-6 mb-6">
        <form action={invite} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[240px]">
            <label htmlFor="invite-email" className="label">
              Invite by email
            </label>
            <input
              id="invite-email"
              name="email"
              type="email"
              required
              placeholder="person@example.com"
              className="input"
            />
          </div>
          <button className="btn-primary">Send invite</button>
        </form>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50/60 border-b border-stone-200">
              <tr className="text-[11px] uppercase tracking-wider text-stone-500">
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-left px-4 py-3 font-medium">Last login</th>
                <th className="text-left px-4 py-3 font-medium">Identity</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {(users ?? []).map(
                (
                  u: Record<string, unknown> & {
                    id: string;
                    email: string;
                    role: string;
                    last_login_at: string | null;
                    removed_at: string | null;
                    auth_user_id: string | null;
                    platform_admin: boolean | null;
                  }
                ) => {
                  const status = u.removed_at
                    ? "removed"
                    : u.auth_user_id
                    ? "active"
                    : "invited";
                  const statusClass =
                    status === "active"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : status === "invited"
                      ? "bg-amber-50 text-amber-800 border-amber-200"
                      : "bg-stone-100 text-stone-500 border-stone-200";
                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-stone-50/60 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-stone-900">
                        {u.email}
                      </td>
                      <td className="px-4 py-3">
                        {u.role === "admin" ? (
                          <span className="chip-brand">{u.role}</span>
                        ) : (
                          <span className="chip-neutral">{u.role}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-stone-600">
                        {u.last_login_at ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-stone-600">
                        {u.auth_user_id ? "linked" : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`chip border ${statusClass} capitalize`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-end">
                          {u.removed_at ? null : u.role === "user" ? (
                            <form action={promote}>
                              <input type="hidden" name="id" value={u.id} />
                              <button className="btn-secondary btn-sm">
                                Promote
                              </button>
                            </form>
                          ) : (
                            <form action={demote}>
                              <input type="hidden" name="id" value={u.id} />
                              <button className="btn-secondary btn-sm">
                                Demote
                              </button>
                            </form>
                          )}
                          {!u.removed_at && (
                            <form action={remove}>
                              <input type="hidden" name="id" value={u.id} />
                              <button className="btn-danger btn-sm">
                                Remove
                              </button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }
              )}
              {(!users || users.length === 0) && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-sm text-stone-500"
                  >
                    No users yet. Send an invite above to get started.
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
