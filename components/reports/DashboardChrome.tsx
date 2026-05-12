import Link from "next/link";
import { ReactNode } from "react";
import { RefreshButton } from "./RefreshButton";

export function DashboardChrome({
  title,
  subtitle,
  tabs,
  active,
  controls,
  children,
}: {
  title: string;
  subtitle?: string;
  tabs: { href: string; label: string }[];
  active: string;
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="font-serif text-2xl md:text-[28px] text-stone-900 tracking-tight leading-none">
            {title}
          </h1>
          {subtitle && <div className="text-sm text-stone-500 mt-1.5">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {controls}
          <RefreshButton />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1 p-1 rounded-lg bg-stone-100/80 border border-stone-200/80 w-fit">
        {tabs.map((t) => {
          const isActive = t.href === active;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                isActive
                  ? "bg-white text-brand-700 shadow-soft"
                  : "text-stone-600 hover:text-brand-700 hover:bg-white/60"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <div className="animate-fade-in">{children}</div>
    </div>
  );
}
