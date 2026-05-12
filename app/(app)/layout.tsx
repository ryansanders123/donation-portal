import { redirect } from "next/navigation";
import { currentAppUser } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";
import { AppFooter } from "@/components/AppFooter";
import { BrandStyle } from "@/components/BrandStyle";
import { getActiveOrg, listUserOrgs } from "@/lib/org-context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentAppUser();
  if (!user) redirect("/login");
  const [activeOrg, userOrgs] = await Promise.all([getActiveOrg(), listUserOrgs()]);
  return (
    <>
      <BrandStyle primaryColor={activeOrg?.primary_color ?? null} />
      <div className="min-h-screen app-backdrop flex flex-col">
        <NavBar user={user} activeOrg={activeOrg} userOrgs={userOrgs} />
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-6 py-8 md:py-10">
          {children}
        </main>
        <AppFooter org={activeOrg} />
      </div>
    </>
  );
}
