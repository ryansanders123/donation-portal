import { Pool } from "pg";

const globalForPg = globalThis as unknown as { pdsPool?: Pool };

export const pdsPool =
  globalForPg.pdsPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 4,
  });

if (process.env.NODE_ENV !== "production") globalForPg.pdsPool = pdsPool;

export async function pdsQuery<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await pdsPool.query(sql, params);
  return res.rows as T[];
}
