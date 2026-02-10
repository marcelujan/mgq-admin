import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

function assertCronAuth(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    const err: any = new Error("unauthorized");
    err.statusCode = 401;
    throw err;
  }
}

export async function GET(req: NextRequest) {
  const started = Date.now();

  try {
    assertCronAuth(req);

    const client = await pool.connect();
    try {
      // Fecha del día tomada desde DB para evitar problemas de TZ
      const d0 = await client.query<{ d: string }>(`select current_date::text as d;`);
      const asOfDate = d0.rows[0]?.d;

      // Upsert diario del último costo manual conocido (aunque no haya cambios)
      const q = await client.query(
        `
        insert into app.cost_option_snapshot (cost_option_id, as_of_date, costo_ars, fuente, created_at)
        select
          c.cost_option_id,
          $1::date as as_of_date,
          c.manual_costo_ars as costo_ars,
          'CRON'::text as fuente,
          now() as created_at
        from app.cost_option c
        where c.activo = true
          and c.tipo = 'MANUAL_PRESENTACION'
          and c.manual_costo_ars is not null
        on conflict (cost_option_id, as_of_date)
        do update set
          costo_ars = excluded.costo_ars,
          fuente = excluded.fuente,
          created_at = excluded.created_at
        `,
        [asOfDate]
      );

      return NextResponse.json({
        ok: true,
        as_of_date: asOfDate,
        rowcount: q.rowCount ?? 0,
        time_ms: Date.now() - started,
      });
    } finally {
      client.release();
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: e?.statusCode ?? 500 }
    );
  }
}