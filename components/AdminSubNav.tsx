"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Features } from "@/lib/org-context";

type Item = { href: string; label: string; feature?: keyof Features };

const ITEMS: Item[] = [
  { href: "/admin/funds", label: "Funds", feature: "funds" },
  { href: "/admin/campaigns", label: "Campaigns", feature: "campaigns" },
  { href: "/admin/appeals", label: "Appeals", feature: "appeals" },
  { href: "/admin/import", label: "Import", feature: "import" },
  { href: "/admin/dedup", label: "Dedup", feature: "dedup" },
  { href: "/admin/exports", label: "Exports", feature: "exports" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/organizations", label: "Organizations" },
];

function enabled(features: Features, key: keyof Features | undefined): boolean {
  if (!key) return true;
  return features[key] !== false;
}

export function AdminSubNav({ features }: { features: Features }) {
  const pathname = usePathname();
  return (
    <div className="mb-6 -mt-2 border-b border-stone-200/70">
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
        {ITEMS.filter((it) => enabled(features, it.feature)).map((it) => {
          const active = pathname === it.href || pathname.startsWith(`${it.href}/`);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`relative px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                active
                  ? "text-brand-700"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              {it.label}
              {active && <span className="absolute -bottom-px left-0 right-0 h-[2px] bg-brand-600 rounded-t" />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
