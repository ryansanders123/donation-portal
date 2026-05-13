import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { voidDonation } from "@/app/(app)/donations/actions";
import { currentAppUser } from "@/lib/auth";
import { VoidForm } from "./VoidForm";

export default async function VoidPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentAppUser();
  const isAdmin = user?.role === "admin";

  if (!isAdmin) {
    return (
      <div className="max-w-xl animate-fade-in">
        <header className="mb-8">
          <h1 className="font-serif text-3xl md:text-4xl text-stone-900 tracking-tight">
            Void donation
          </h1>
        </header>
        <div className="card p-6 md:p-8">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-8 w-8 rounded-full bg-red-50 text-red-700 flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M10 6v4M10 14h.01M3 17l7-12 7 12H3z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <div className="font-medium text-stone-900">Admin access required</div>
              <p className="text-sm text-stone-600 mt-1">
                Voiding a donation is restricted to administrators. If this was a mistake,
                ask an admin to record a corrected entry or void the original.
              </p>
              <Link href="/report" className="btn-secondary mt-4 inline-flex">
                Back to report
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: d } = await supabase
    .from("donations")
    .select("id,amount,date_received,type,donees(name),funds(name),voided_at")
    .eq("id", id)
    .single();

  if (!d) {
    return (
      <div className="max-w-xl animate-fade-in">
        <h1 className="font-serif text-3xl md:text-4xl text-stone-900 mb-6 tracking-tight">
          Void donation
        </h1>
        <div className="card p-6 text-stone-600">Donation not found.</div>
      </div>
    );
  }
  if (d.voided_at) {
    return (
      <div className="max-w-xl animate-fade-in">
        <h1 className="font-serif text-3xl md:text-4xl text-stone-900 mb-6 tracking-tight">
          Void donation
        </h1>
        <div className="card p-6 text-stone-600">This donation is already voided.</div>
      </div>
    );
  }

  async function submit(formData: FormData) {
    "use server";
    const reason = String(formData.get("reason") ?? "").trim();
    const confirm = String(formData.get("confirm") ?? "").trim();
    await voidDonation({ id, reason, confirm });
    redirect("/report");
  }

  const donee = (d as unknown as { donees?: { name?: string } }).donees?.name;
  const fund = (d as unknown as { funds?: { name?: string } }).funds?.name;

  return (
    <div className="max-w-xl animate-fade-in">
      <header className="mb-8">
        <h1 className="font-serif text-3xl md:text-4xl text-stone-900 tracking-tight">
          Void donation
        </h1>
        <p className="mt-2 text-stone-600">
          Voiding preserves the record but excludes it from totals. This action
          requires a written reason and typed confirmation.
        </p>
      </header>

      <div className="card p-6 md:p-8">
        <div className="mb-6 p-4 bg-gradient-to-br from-red-50 to-stone-50 border border-red-100 rounded-xl">
          <div className="text-xs uppercase tracking-wider text-red-700/80 font-medium mb-1">
            You are about to void
          </div>
          <div className="text-base font-medium text-stone-900">
            {donee}
            <span className="text-stone-400"> · </span>
            <span className="text-brand-700">${d.amount}</span>
            <span className="text-stone-400"> · </span>
            <span className="capitalize">{d.type}</span>
            <span className="text-stone-400"> · </span>
            {fund}
          </div>
          <div className="text-sm text-stone-600 mt-1">{d.date_received}</div>
        </div>

        <VoidForm action={submit} />
      </div>
    </div>
  );
}
