import { ReactNode } from "react";

export function Sheet({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="card overflow-hidden">
      {title && (
        <div className="px-4 py-2.5 border-b border-stone-200/70 bg-stone-50/60">
          <div className="text-[11px] uppercase tracking-[0.14em] text-stone-500 font-semibold flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-600" />
            {title}
          </div>
        </div>
      )}
      <div className="overflow-auto">{children}</div>
    </div>
  );
}
