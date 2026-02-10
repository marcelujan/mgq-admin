import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
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
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return false;
  }
  return true;
}

/**
 * Inserta/actualiza 1 snapshot por día por item_formulado BULK.
 * Si no hay costos cargados, queda 0 (política elegida).
 * Fuente: CRON.
 */
export async function GET(req: NextRequest) {
  if (!assertCronAuth(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    const d0 = await client.query<{ d: string }>(`select current_date::text as d;`);
    const asOfDate = d0.rows[0]?.d;

    const q = await client.query(
      `
      insert into app.item_formulado_snapshot
        (item_formulado_id, as_of_date, precio_unitario_ars, fuente, created_at)
      select
        f.item_formulado_id,
        current_date,
        (
          coalesce(c.costo_variable_por_kg_ars, 0)
          + case
              when coalesce(c.lote_ref_kg, 0) > 0
                then coalesce(c.costo_fijo_por_lote_ars, 0) / c.lote_ref_kg
              else 0
            end
        ) as precio_unitario_ars,
        'CRON'::text as fuente,
        now() as created_at
      from app.item_formulado f
      left join app.producto_costos_produccion c
        on c.producto_id::int = f.producto_id
      where f.tipo = 'BULK'
        and f.activo = true
      on conflict (item_formulado_id, as_of_date)
      do update set
        precio_unitario_ars = excluded.precio_unitario_ars,
        fuente = excluded.fuente,
        created_at = excluded.created_at
      returning 1;
      `
    );

    return NextResponse.json(
      { ok: true, as_of_date: asOfDate, rowcount: q.rowCount },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}