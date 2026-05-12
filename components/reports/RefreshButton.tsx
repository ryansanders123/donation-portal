"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function RefreshButton() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [spin, setSpin] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost text-xs"
      onClick={() => {
        setSpin(true);
        startTransition(() => router.refresh());
        setTimeout(() => setSpin(false), 600);
      }}
      title="Refresh data"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={spin ? "animate-spin" : ""}
        aria-hidden="true"
      >
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        <path d="M3 21v-5h5" />
      </svg>
      Refresh
    </button>
  );
}
