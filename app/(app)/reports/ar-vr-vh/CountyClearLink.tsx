"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function CountyClearLink({ county }: { county: string }) {
  const path = usePathname();
  return (
    <Link
      href={path}
      className="chip chip-stone text-[11px] hover:bg-stone-200/60 transition-colors"
    >
      {county} <span className="text-stone-400 ml-1">×</span>
    </Link>
  );
}
