import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org-context";
import { parseHex } from "@/lib/brand";
import { PrintButtonClient } from "./PrintButtonClient";

type PrintRow = {
  date_received: string;
  type: string;
  amount: string;
  funds: { name: string } | { name: string }[] | null;
};

type PrintDonee = {
  id: string;
  name: string;
  address: string | null;
};

const nameOf = (rel: { name: string } | { name: string }[] | null | undefined): string => {
  if (!rel) return "";
  if (Array.isArray(rel)) return rel[0]?.name ?? "";
  return rel.name ?? "";
};

export default async function PrintView({ params }: { params: { doneeId: string; year: string } }) {
  const year = parseInt(params.year, 10);
  const supabase = createSupabaseServerClient();
  const [org, doneeRes, rowsRes] = await Promise.all([
    getActiveOrg(),
    supabase.from("donees").select("*").eq("id", params.doneeId).single(),
    supabase.from("donations")
      .select("date_received,type,amount,funds(name)")
      .eq("donee_id", params.doneeId)
      .is("voided_at", null)
      .gte("date_received", `${year}-01-01`).lt("date_received", `${year + 1}-01-01`)
      .order("date_received"),
  ]);
  const donee = (doneeRes.data ?? null) as PrintDonee | null;
  const rows = (rowsRes.data ?? []) as PrintRow[];
  const total = rows.reduce((s: number, r) => s + Number(r.amount), 0);

  const orgName = org?.name ?? process.env.NEXT_PUBLIC_ORG_NAME ?? "Organization";
  const orgAddr = org?.mailing_address ?? process.env.NEXT_PUBLIC_ORG_ADDRESS ?? "";
  const orgTax = org?.tax_statement_text ?? process.env.NEXT_PUBLIC_ORG_TAX_STATEMENT ?? "";
  const brandColor = org?.primary_color && parseHex(org.primary_color) ? org.primary_color : "#751411";

  return (
    <html>
      <body>
        <style>{`
          body { font-family: Georgia, serif; color: #222; max-width: 780px; margin: 2rem auto; padding: 0 1.5rem; }
          h1 { font-size: 1.75rem; margin: 0; color: ${brandColor}; }
          table { width: 100%; border-collapse: collapse; margin-top: 1.5rem; }
          th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #ccc; }
          td.r, th.r { text-align: right; }
          .footer { margin-top: 2rem; font-size: 0.9rem; white-space: pre-line; }
          @media print { .noprint { display: none; } }
        `}</style>
        <header>
          <h1>{orgName}</h1>
          <div style={{ whiteSpace: "pre-line", color: "#555" }}>{orgAddr}</div>
        </header>
        <section style={{ marginTop: "2rem" }}>
          <div><strong>Donor:</strong> {donee?.name}</div>
          {donee?.address && <div style={{ whiteSpace: "pre-line" }}>{donee.address}</div>}
          <div><strong>Tax year:</strong> {year}</div>
          <div><strong>Total contributions:</strong> ${total.toFixed(2)}</div>
        </section>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Fund</th>
              <th className="r">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i: number) => (
              <tr key={i}>
                <td>{r.date_received}</td>
                <td>{r.type}</td>
                <td>{nameOf(r.funds)}</td>
                <td className="r">${Number(r.amount).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="footer">{orgTax}</div>
        <PrintButtonClient />
      </body>
    </html>
  );
}
