// lib/db.ts
import { neon } from '@neondatabase/serverless';

export const sql = neon(process.env.DATABASE_URL!);

// helper opcional, por si en otros endpoints querés usar query(text, params)
export async function query<T = any>(text: string, params: any[] = []) {
  const rows = await (sql as any).unsafe(text, params);
  return { rows } as { rows: T[] };
}
