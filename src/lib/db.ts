import { neon } from "@neondatabase/serverless";

let _sql: ReturnType<typeof neon> | null = null;

export function db() {
  const url = process.env.NEON_DATABASE_URL;
  if (!url) throw new Error("Falta NEON_DATABASE_URL en el entorno");

  if (!_sql) _sql = neon(url);
  return _sql;
}