import { brandCss } from "@/lib/brand";

// Server component. Emits a single <style> tag that overrides the
// :root --brand-* CSS variables (the defaults live in globals.css).
// Tailwind's `bg-brand-600` etc. resolve through these, so a single
// `primary_color` value on an organization re-themes the whole app.
//
// Rendered inside `app/(app)/layout.tsx`, AFTER the user has been
// authenticated and their active org is known — anonymous routes
// (login, error) keep the default palette.
export function BrandStyle({ primaryColor }: { primaryColor: string | null | undefined }) {
  const css = brandCss(primaryColor);
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
