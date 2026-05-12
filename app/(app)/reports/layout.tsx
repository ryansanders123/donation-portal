import { requireFeature } from "@/lib/org-context";

export default async function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeature("analysis");
  return <>{children}</>;
}
