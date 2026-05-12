import { pdsQuery } from "@/lib/pds-db";
import { Sheet } from "@/components/reports/Sheet";
import { DashboardChrome } from "@/components/reports/DashboardChrome";
import { ZipMap } from "./ZipMap";

export const dynamic = "force-dynamic";

const TABS = [
  { href: "/reports/ar-vr-vh", label: "AR VR VH" },
  { href: "/reports/ubi", label: "UBI" },
];

type ZipRow = { zip: string; avg_ubi: number; households: number };

export default async function UBIPage() {
  const rows = await pdsQuery<ZipRow>(
    `SELECT zip,
            (SUM(ubi::bigint * households::bigint))::float / NULLIF(SUM(households)::float, 0) AS avg_ubi,
            SUM(households)::bigint AS households
     FROM pds.accudata_ubi
     WHERE state = 'AR'
     GROUP BY zip`
  );

  return (
    <DashboardChrome
      title="Arkansas Underbanked Heat Map"
      tabs={TABS}
      active="/reports/ubi"
    >
      <Sheet title="UBI by ZIP">
        <div className="p-3">
          <ZipMap rows={rows} />
        </div>
      </Sheet>
    </DashboardChrome>
  );
}
