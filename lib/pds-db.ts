import { createSupabaseServerClient } from "@/lib/supabase/server";

const PAGE_SIZE = 1000;

export type ArVrVhRow = {
  county: string | null;
  gender: string | null;
  age_segment: string | null;
  flg_dem: string | null;
  flg_rep: string | null;
  voting_recency: string | null;
  records: number;
};

export type UbiRow = {
  state: string;
  zip: string | null;
  ubi: number;
  households: number;
};

async function fetchAll<T extends Record<string, unknown>>(
  rpcName: "pds_ar_vr_vh_rows" | "pds_accudata_ubi_rows",
): Promise<T[]> {
  const supabase = await createSupabaseServerClient();
  const rows: T[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase.rpc(rpcName).range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`load ${rpcName}: ${error.message}`);
    if (!data || data.length === 0) break;

    rows.push(...(data as unknown as T[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

export async function getArVrVhRows(): Promise<ArVrVhRow[]> {
  return fetchAll<ArVrVhRow>("pds_ar_vr_vh_rows");
}

export async function getUbiRows(): Promise<UbiRow[]> {
  return fetchAll<UbiRow>("pds_accudata_ubi_rows");
}
