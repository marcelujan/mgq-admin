// src/lib/db.ts
import { Pool } from "pg";

declare global { var __pgPool: Pool | undefined }

export const pool =
  global.__pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000, keepAlive: true });

if (!global.__pgPool) global.__pgPool = pool;

export async function query<T = any>(text: string, params: any[] = []) {
  const client = await pool.connect();
  try { return await client.query<T>(text, params); }
  finally { client.release(); }
}

export const runtime = "nodejs";
