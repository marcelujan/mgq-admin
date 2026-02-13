import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

async function run() {
  const started = Date.now();
  const client = await pool.connect();
  try {
    // Fecha del día desde DB para evitar TZ issues
    const d0 = await client.query<{ d: string }>(`select current_date::text as d;`);
    const asOfDate = d0.rows[0]?.d;

    const q = await client.query(
      `
      insert into app.cost_option_snapshot
        (cost_option_id, as_of_date, costo_ars, fuente, created_at)
      select
        c.cost_option_id,
        $1::date as as_of_date,
        coalesce(c.manual_costo_ars, 0) as costo_ars,
        'CRON'::text as fuente,
        now() as created_at
      from app.cost_option c
      where c.activo = true
        and c.tipo = 'MANUAL_PRESENTACION'
      on conflict (cost_option_id, as_of_date)
      do update set
        costo_ars = excluded.costo_ars,
        fuente = excluded.fuente,
        created_at = excluded.created_at
      `,
      [asOfDate]
    );

    return {
      ok: true,
      as_of_date: asOfDate,
      rowcount: q.rowCount ?? 0,
      time_ms: Date.now() - started,
    };
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCronAuth(req);
    const payload = await run();
    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: e?.statusCode ?? 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}