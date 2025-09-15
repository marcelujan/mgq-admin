// src/lib/db.ts
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

// Wrapper compatible con tu código existente
export async function query<T = any>(text: string, params: any[] = []) {
  // .unsafe permite SQL parametrizado como pg
  const rows = await (sql as any).unsafe(text, params);
  return { rows } as { rows: T[] };
}

export { sql };
