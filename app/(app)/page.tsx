import Link from "next/link";
import { currentAppUser } from "@/lib/auth";
import { getActiveOrg } from "@/lib/org-context";
import { getMonthlyTotals } from "@/lib/dashboard";
import { DonationsChart } from "@/components/DonationsChart";

export default async function Home() {
  const [user, org, data] = await Promise.all([
    currentAppUser(),
    getActiveOrg(),
    getMonthlyTotals(),
  ]);
  const isAdmin = user?.role === "admin";
  const orgName = org?.name ?? process.env.NEXT_PUBLIC_ORG_NAME ?? "Donation Portal";

  const actions = [
    {
      href: "/donations/add",
      title: "Add Donation",
      description: "Record a new cash, check, or online gift.",
      icon: <PlusIcon />,
      accent: "from-brand-50 to-brand-100 text-brand-700 ring-brand-200",
    },
    {
      href: "/donors",
      title: "Browse Donors",
      description: "Search donors and review their giving history.",
      icon: <UsersIcon />,
      accent: "from-sky-50 to-sky-100 text-sky-800 ring-sky-200",
    },
    {
      href: "/report",
      title: "Monthly Report",
      description: "Review totals by fund, type, and donor.",
      icon: <ChartIcon />,
      accent: "from-amber-50 to-amber-100 text-amber-800 ring-amber-200",
    },
    {
      href: "/tax-summary",
      title: "Tax Summary",
      description: "Generate annual giving statements for donors.",
      icon: <ReceiptIcon />,
      accent: "from-emerald-50 to-emerald-100 text-emerald-800 ring-emerald-200",
    },
  ];

  const adminActions = [
    {
      href: "/admin/funds",
      title: "Manage Funds",
      description: "Add and archive designated funds.",
      icon: <FolderIcon />,
    },
    {
      href: "/admin/campaigns",
      title: "Manage Campaigns",
      description: "Set up giving drives with goals and dates.",
      icon: <FlagIcon />,
    },
    {
      href: "/admin/appeals",
      title: "Manage Appeals",
      description: "Track which solicitation produced each gift.",
      icon: <MegaphoneIcon />,
    },
    {
      href: "/admin/exports",
      title: "Bulk Exports",
      description: "Download all-donor tax data as CSV for the year.",
      icon: <DownloadIcon />,
    },
    {
      href: "/admin/users",
      title: "Manage Users",
      description: "Invite members and set permissions.",
      icon: <UsersIcon />,
    },
  ];

  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <section className="mb-8 md:mb-10">
        <div className="flex items-center gap-2 mb-3">
          <span className="chip-brand">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
            {user?.email}
          </span>
          {isAdmin && (
            <span className="chip-neutral">
              <span className="h-1.5 w-1.5 rounded-full bg-stone-500" />
              Admin
            </span>
          )}
        </div>
        <h1 className="page-title text-balance">
          Welcome to <span className="text-brand-700">{orgName}</span>
        </h1>
        <p className="page-subtitle text-base md:text-lg max-w-2xl">
          Record contributions, track fund performance, and prepare donor tax
          statements - all in one place.
        </p>
      </section>

      {/* Quick actions */}
      <section className="mb-10">
        <h2 className="section-eyebrow">Quick actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {actions.map((a) => (
            <Link key={a.href} href={a.href} className="card-interactive p-5 md:p-6 block group">
              <div
                className={`h-10 w-10 rounded-xl bg-gradient-to-br ring-1 flex items-center justify-center mb-4 ${a.accent}`}
              >
                {a.icon}
              </div>
              <div className="font-serif text-lg md:text-xl text-stone-900 leading-snug group-hover:text-brand-700 transition-colors">
                {a.title}
              </div>
              <div className="text-sm text-stone-600 text-pretty mt-1">
                {a.description}
              </div>
              <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-brand-700">
                Open
                <ArrowRightIcon />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Giving over time */}
      <section className="mb-10">
        <h2 className="section-eyebrow">Giving over time</h2>
        <DonationsChart data={data} />
      </section>

      {isAdmin && (
        <section>
          <h2 className="section-eyebrow">Administration</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {adminActions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="card-interactive p-5 flex items-start gap-4 group"
              >
                <div className="h-10 w-10 rounded-lg bg-stone-100 text-stone-600 flex items-center justify-center shrink-0">
                  {a.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-stone-900 group-hover:text-brand-700 transition-colors">
                    {a.title}
                  </div>
                  <div className="text-sm text-stone-600 mt-0.5">
                    {a.description}
                  </div>
                </div>
                <ArrowRightIcon className="text-stone-400 group-hover:text-brand-700 transition-colors mt-1" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* --- inline icons (minimal, 20x20 stroke) --- */

function PlusIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M10 4v12M4 10h12"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 16V9M10 16V4M16 16v-5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 3h10v14l-2.5-1.5L10 17l-2.5-1.5L5 17V3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8 7h4M8 10h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 6a1 1 0 011-1h3.5L9 6.5h7a1 1 0 011 1V15a1 1 0 01-1 1H4a1 1 0 01-1-1V6z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="7.5" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M3 16c0-2.2 2-4 4.5-4s4.5 1.8 4.5 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M13 11a2 2 0 100-4M13.5 16c0-1.6.5-2.8 1.5-3.5 1.8.2 3 1.7 3 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M5 3v14M5 4h9l-1.5 3.5L14 11H5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MegaphoneIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M3 8.5v3l9 3V5.5l-9 3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M12 6.5L17 4v12l-5-2.5M6 11.5v3a1 1 0 001 1h1a1 1 0 001-1v-2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 3v9m0 0l4-4m-4 4l-4-4M4 14v1a2 2 0 002 2h8a2 2 0 002-2v-1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowRightIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 8h10m0 0L9 4m4 4l-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
