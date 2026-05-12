import { requireFeature } from "@/lib/org-context";

export default async function DedupLayout({ children }: { children: React.ReactNode }) {
  await requireFeature("dedup");
  return <>{children}</>;
}
