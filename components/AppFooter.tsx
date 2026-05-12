import type { Organization } from "@/lib/org-context";

// Renders the org's contact info at the bottom of every authenticated
// page. Falls back gracefully when fields are NULL — empty lines just
// don't render. Anonymous routes don't include a footer at all.
export function AppFooter({ org }: { org: Organization | null }) {
  const year = new Date().getFullYear();
  if (!org) return null;
  return (
    <footer className="mt-16 border-t border-stone-200/70 bg-white/60 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-stone-500">
        <div>
          <div className="font-medium text-stone-700">{org.name}</div>
          <div className="mt-0.5">© {year} {org.name}. All rights reserved.</div>
        </div>
        <div className="md:text-center">
          {org.support_email && (
            <a
              href={`mailto:${org.support_email}`}
              className="hover:text-brand-700 transition-colors"
            >
              {org.support_email}
            </a>
          )}
        </div>
        <div className="md:text-right">
          {org.mailing_address && (
            <div className="whitespace-pre-line">{org.mailing_address}</div>
          )}
        </div>
      </div>
    </footer>
  );
}
