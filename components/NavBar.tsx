"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AppUser } from "@/lib/auth";
import type { Features, Organization } from "@/lib/org-context";
import { OrgSwitcher } from "@/components/OrgSwitcher";

type OrgLite = Pick<Organization, "id" | "slug" | "name" | "logo_url">;

const FALLBACK_NAME = process.env.NEXT_PUBLIC_ORG_NAME ?? "Donation Portal";
const FALLBACK_LOGO = process.env.NEXT_PUBLIC_ORG_LOGO_URL ?? "/logo.png";

function feature(features: Features | undefined, name: keyof Features): boolean {
  if (!features) return true;
  const v = features[name];
  if (v === false) return false;
  return true;
}

export function NavBar({
  user,
  activeOrg,
  userOrgs,
}: {
  user: AppUser;
  activeOrg: Organization | null;
  userOrgs: OrgLite[];
}) {
  const isAdmin = user.role === "admin";
  const initials = (user.email ?? "?")
    .split("@")[0]
    .split(/[._-]/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const orgName = activeOrg?.name ?? FALLBACK_NAME;
  const orgLogo = activeOrg?.logo_url ?? FALLBACK_LOGO;
  const features = activeOrg?.features;

  return (
    <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-stone-200/60">
      <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center gap-2">
        <Link href="/" className="flex items-center gap-3 mr-auto group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={orgLogo} alt={orgName} className="h-9 w-auto" />
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="font-serif text-[17px] text-brand-700 tracking-tight group-hover:text-brand-800 transition-colors">
              {orgName}
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-stone-400">
              Donation Portal
            </span>
          </div>
        </Link>

        <div className="hidden md:flex items-center gap-0.5">
          {feature(features, "donations") && (
            <NavLink href="/donations/add">Add</NavLink>
          )}
          {feature(features, "donors") && (
            <NavLink href="/donors" matchPrefix>Donors</NavLink>
          )}
          {feature(features, "reports") && (
            <NavLink href="/report">Report</NavLink>
          )}
          {feature(features, "analysis") && (
            <NavLink href="/reports" matchPrefix>Analysis</NavLink>
          )}
          {feature(features, "tax_summary") && (
            <NavLink href="/tax-summary" matchPrefix>Tax</NavLink>
          )}
          {isAdmin && <NavLink href="/admin" matchPrefix>Admin</NavLink>}
        </div>

        <div className="flex items-center gap-2 ml-auto md:ml-2 pl-2 md:pl-3 md:border-l md:border-stone-200">
          {activeOrg && userOrgs.length > 1 && (
            <OrgSwitcher active={activeOrg} orgs={userOrgs} />
          )}
          <div className="hidden md:flex items-center gap-2 pr-1">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-brand-800 flex items-center justify-center text-xs font-semibold ring-1 ring-brand-200/60">
              {initials || "?"}
            </div>
            <div className="flex flex-col leading-tight max-w-[160px]">
              <span className="text-xs font-medium text-stone-800 truncate">
                {user.email}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-stone-400">
                {isAdmin ? "Admin" : "Member"}
              </span>
            </div>
          </div>
          <form action="/auth/signout" method="post" className="inline">
            <button
              type="submit"
              className="btn-ghost btn-sm"
              title="Sign out"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>

      {/* Mobile nav strip — visible below md */}
      <div className="md:hidden border-t border-stone-200/60 bg-white/70 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-2 py-1.5 flex items-center gap-0.5 overflow-x-auto no-scrollbar">
          {feature(features, "donations") && (
            <NavLink href="/donations/add">Add</NavLink>
          )}
          {feature(features, "donors") && (
            <NavLink href="/donors" matchPrefix>Donors</NavLink>
          )}
          {feature(features, "reports") && (
            <NavLink href="/report">Report</NavLink>
          )}
          {feature(features, "analysis") && (
            <NavLink href="/reports" matchPrefix>Analysis</NavLink>
          )}
          {feature(features, "tax_summary") && (
            <NavLink href="/tax-summary" matchPrefix>Tax</NavLink>
          )}
          {isAdmin && <NavLink href="/admin" matchPrefix>Admin</NavLink>}
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  children,
  matchPrefix = false,
}: {
  href: string;
  children: React.ReactNode;
  matchPrefix?: boolean;
}) {
  const pathname = usePathname();
  const active = matchPrefix
    ? pathname === href || pathname.startsWith(`${href}/`)
    : pathname === href;
  return (
    <Link
      href={href}
      className={`relative px-3 py-2 text-sm rounded-lg transition-colors font-medium whitespace-nowrap ${
        active
          ? "text-brand-700 bg-brand-50"
          : "text-stone-600 hover:text-brand-700 hover:bg-stone-100"
      }`}
    >
      {children}
      {active && (
        <span className="absolute -bottom-px left-3 right-3 h-px bg-brand-600" />
      )}
    </Link>
  );
}
