import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  addUserToOrg,
  removeUserFromOrg,
  updateOrganizationBranding,
  updateOrganizationFeatures,
} from "@/lib/org-actions";

const FEATURE_KEYS: { key: string; label: string }[] = [
  { key: "donations", label: "Donations" },
  { key: "donors", label: "Donors" },
  { key: "reports", label: "Reports" },
  { key: "funds", label: "Funds" },
  { key: "campaigns", label: "Campaigns" },
  { key: "appeals", label: "Appeals" },
  { key: "tax_summary", label: "Tax summary" },
  { key: "import", label: "CSV Import" },
  { key: "exports", label: "Exports" },
];

export default async function OrganizationDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdmin();
  const supabase = createSupabaseServiceClient();

  const { data: org } = await supabase
    .from("organizations")
    .select(
      "id, slug, name, logo_url, favicon_url, primary_color, tagline, support_email, mailing_address, tax_statement_text, features",
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!org) notFound();

  const { data: members } = await supabase
    .from("user_organizations")
    .select("user_id, role, users!inner(id, email, role, first_login_at)")
    .eq("organization_id", params.id);

  async function saveBranding(fd: FormData) {
    "use server";
    await updateOrganizationBranding({
      id: params.id,
      name: String(fd.get("name") ?? ""),
      tagline: emptyToNull(fd.get("tagline")),
      logo_url: emptyToNull(fd.get("logo_url")),
      favicon_url: emptyToNull(fd.get("favicon_url")),
      primary_color: emptyToNull(fd.get("primary_color")),
      support_email: emptyToNull(fd.get("support_email")),
      mailing_address: emptyToNull(fd.get("mailing_address")),
      tax_statement_text: emptyToNull(fd.get("tax_statement_text")),
    });
  }

  async function saveFeatures(fd: FormData) {
    "use server";
    const features: Record<string, boolean> = {};
    for (const { key } of FEATURE_KEYS) {
      features[key] = fd.get(`feature_${key}`) === "on";
    }
    await updateOrganizationFeatures({ id: params.id, features });
  }

  async function addMember(fd: FormData) {
    "use server";
    await addUserToOrg({
      email: String(fd.get("email") ?? ""),
      orgId: params.id,
      role: (String(fd.get("role") ?? "member") as "admin" | "member"),
    });
  }

  async function removeMember(fd: FormData) {
    "use server";
    await removeUserFromOrg({
      userId: String(fd.get("user_id") ?? ""),
      orgId: params.id,
    });
  }

  const features = (org.features ?? {}) as Record<string, boolean>;

  return (
    <div className="animate-fade-in max-w-5xl space-y-6">
      <header>
        <h1 className="page-title">{org.name}</h1>
        <p className="page-subtitle">
          <span className="font-mono text-xs text-stone-500">{org.slug}</span>
        </p>
      </header>

      <section className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Branding</h2>
        <form action={saveBranding} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Display name</label>
            <input name="name" defaultValue={org.name} required className="input" />
          </div>
          <div>
            <label className="label">Tagline</label>
            <input name="tagline" defaultValue={org.tagline ?? ""} className="input" placeholder="Donation Portal" />
            <p className="text-xs text-stone-500 mt-1">Shown under the org name in the nav bar.</p>
          </div>
          <div>
            <label className="label">Logo URL</label>
            <input name="logo_url" defaultValue={org.logo_url ?? ""} className="input" placeholder="/logo.png or https://…" />
          </div>
          <div>
            <label className="label">Favicon URL</label>
            <input name="favicon_url" defaultValue={org.favicon_url ?? ""} className="input" placeholder="defaults to the logo" />
          </div>
          <div>
            <label className="label">Brand color (hex)</label>
            <input name="primary_color" defaultValue={org.primary_color ?? ""} className="input" placeholder="#751411" />
            <p className="text-xs text-stone-500 mt-1">Sets the full brand-50…900 palette. Leave blank for the platform default.</p>
          </div>
          <div>
            <label className="label">Support email</label>
            <input name="support_email" type="email" defaultValue={org.support_email ?? ""} className="input" />
          </div>
          <div className="md:col-span-2">
            <label className="label">Mailing address</label>
            <textarea name="mailing_address" defaultValue={org.mailing_address ?? ""} className="input min-h-[80px]" />
          </div>
          <div className="md:col-span-2">
            <label className="label">Tax statement boilerplate</label>
            <textarea
              name="tax_statement_text"
              defaultValue={org.tax_statement_text ?? ""}
              className="input min-h-[120px]"
              placeholder="No goods or services were provided in exchange for these contributions…"
            />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <button className="btn-primary">Save branding</button>
          </div>
        </form>
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Features</h2>
        <form action={saveFeatures} className="space-y-3">
          {FEATURE_KEYS.map((f) => (
            <label key={f.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={`feature_${f.key}`}
                defaultChecked={features[f.key] !== false}
              />
              {f.label}
            </label>
          ))}
          <div className="flex justify-end pt-2">
            <button className="btn-primary">Save features</button>
          </div>
        </form>
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Members</h2>
        <form action={addMember} className="flex flex-wrap gap-3 items-end mb-5">
          <div className="flex-1 min-w-[220px]">
            <label className="label">Email</label>
            <input name="email" type="email" required className="input" placeholder="user@example.com" />
          </div>
          <div>
            <label className="label">Role</label>
            <select name="role" defaultValue="member" className="input">
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <button className="btn-primary">Add</button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50/60 border-b border-stone-200">
              <tr className="text-[11px] uppercase tracking-wider text-stone-500">
                <th className="text-left px-3 py-2 font-medium">Email</th>
                <th className="text-left px-3 py-2 font-medium">Role here</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {(members ?? []).length === 0 && (
                <tr><td colSpan={4} className="px-3 py-8 text-center text-stone-500">No members yet.</td></tr>
              )}
              {(members ?? []).map((m) => {
                const u = (Array.isArray(m.users) ? m.users[0] : m.users) as
                  | { id: string; email: string; first_login_at: string | null }
                  | undefined;
                if (!u) return null;
                return (
                  <tr key={`${m.user_id}-${params.id}`}>
                    <td className="px-3 py-2 font-medium text-stone-800">{u.email}</td>
                    <td className="px-3 py-2 text-stone-600">{m.role}</td>
                    <td className="px-3 py-2 text-stone-600">
                      {u.first_login_at ? "signed-in" : "invited"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <form action={removeMember}>
                        <input type="hidden" name="user_id" value={u.id} />
                        <button className="btn-secondary btn-sm">Remove</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function emptyToNull(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}
