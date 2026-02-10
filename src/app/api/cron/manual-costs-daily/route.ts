import { NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function assertCronAuth(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return false;
  }
  return true;
}

export async function GET(req: Request) {
  if (!assertCronAuth(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    // usa current_date de DB para evitar TZ
    const d0 = await client.query<{ d: string }>(`select current_date::text as d;`);
    const asOf = d0.rows[0]?.d;

    const r = await client.query(
      `
      insert into app.cost_option_snapshot (cost_option_id, as_of_date, costo_ars, fuente, created_at)
      select
        c.cost_option_id,
        current_date,
        c.manual_costo_ars,
        'CRON'::text,
        now()
      from app.cost_option c
      where c.activo = true
        and c.manual_costo_ars is not null
      on conflict (cost_option_id, as_of_date)
      do update set
        costo_ars = excluded.costo_ars,
        fuente = excluded.fuente,
        created_at = excluded.created_at
      ;
      `
    );

    return NextResponse.json({ ok: true, as_of_date: asOf, rowcount: r.rowCount ?? null });
  } finally {
    client.release();
  }
}