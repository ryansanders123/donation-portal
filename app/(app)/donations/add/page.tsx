import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DonationForm } from "@/components/DonationForm";
import { getActiveOrg, hasFeature } from "@/lib/org-context";

export default async function AddDonationPage() {
  const supabase = await createSupabaseServerClient();
  const org = await getActiveOrg();
  const showFunds = hasFeature(org, "funds");
  const showCampaigns = hasFeature(org, "campaigns");
  const showAppeals = hasFeature(org, "appeals");
  const [{ data: funds }, { data: campaigns }, { data: appeals }] = await Promise.all([
    showFunds
      ? supabase.from("funds").select("id,name").is("archived_at", null).order("name")
      : Promise.resolve({ data: [] }),
    showCampaigns
      ? supabase.from("campaigns").select("id,name").is("archived_at", null).order("name")
      : Promise.resolve({ data: [] }),
    showAppeals
      ? supabase.from("appeals").select("id,name").is("archived_at", null).order("name")
      : Promise.resolve({ data: [] }),
  ]);
  return (
    <div className="animate-fade-in">
      <header className="mb-8">
        <h1 className="page-title">Add donation</h1>
        <p className="page-subtitle">
          Record a new contribution. Required fields are marked.
        </p>
      </header>
      <div className="card p-6 md:p-8">
        <DonationForm
          funds={funds ?? []}
          campaigns={campaigns ?? []}
          appeals={appeals ?? []}
          showFunds={showFunds}
          showCampaigns={showCampaigns}
          showAppeals={showAppeals}
        />
      </div>
    </div>
  );
}
