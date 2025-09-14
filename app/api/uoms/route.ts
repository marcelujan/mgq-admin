import { sql } from '@/lib/db';

export async function GET() {
  const rows = await sql`SELECT codigo FROM app.allowed_uoms ORDER BY codigo`;
  return Response.json(rows.map((r:any)=>r.codigo));
}
