// cron/formulado-costs-daily/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Pool } from "pg";
import { computeBulkCost, ensureItemFormuladoBulk } from "@/lib/bulkCost";

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

type RunOpts = {
  dryRun: boolean;
  productoIds: number[] | null;
};

function parseProductoIds(param: string | null): number[] | null {
  if (!param) return null;
  const parts = param
    .split(",")
    .map((s) => Number(String(s).trim()))
    .filter((n) => Number.isFinite(n));
  return parts.length ? parts : null;
}

async function run(opts: RunOpts) {
  const client = await pool.connect();
  try {
    const d0 = await client.query<{ d: string }>(`select current_date::text as d;`);
    const asOfDate = d0.rows[0]?.d;

    // Productos formulados activos detectables por header o por líneas.
    // Esto alinea el cron con /api/items y evita dejar en PEND formulados nuevos
    // creados desde el editor cuando todavía faltaba persistir el header v2.
    const rProd = await client.query<{
      producto_id: number;
      item_formulado_id: number | null;
    }>(
      `
      WITH productos_formulados_v2 AS (
        SELECT DISTINCT producto_id::int as producto_id
        FROM (
          SELECT producto_id FROM app.producto_formula_v2
          UNION
          SELECT producto_id FROM app.producto_formula_linea_v2
        ) x
        WHERE producto_id IS NOT NULL
      )
      SELECT
        p.producto_id::int as producto_id,
        f.item_formulado_id::int as item_formulado_id
      FROM app.producto p
      JOIN productos_formulados_v2 pf ON pf.producto_id = p.producto_id
      LEFT JOIN LATERAL (
        SELECT item_formulado_id
        FROM app.item_formulado f
        WHERE f.producto_id = p.producto_id
          AND f.tipo='BULK'
          AND f.activo=true
        ORDER BY f.item_formulado_id ASC
        LIMIT 1
      ) f ON true
      WHERE p.activo = true
        AND (
          $1::int[] IS NULL
          OR p.producto_id = ANY($1::int[])
        )
      ORDER BY p.producto_id ASC
      `,
      [opts.productoIds]
    );

    const results: any[] = [];
    const errors: any[] = [];
    let upserts = 0;

    for (const row of rProd.rows ?? []) {
      const producto_id = Number(row.producto_id);

      try {
        const item_formulado_id = row.item_formulado_id
          ? Number(row.item_formulado_id)
          : await ensureItemFormuladoBulk(client as any, producto_id);

        const cost = await computeBulkCost(client as any, producto_id, [], 0);

        if (!Number.isFinite(cost.ars_por_kg) || cost.ars_por_kg <= 0) {
          throw new Error("bulk: costo calculado inválido (<=0)");
        }

        results.push({
          producto_id,
          item_formulado_id,
          ars_por_kg: Number(cost.ars_por_kg),
          prod_ars_por_kg: Number(cost.prod_ars_por_kg),
          material_ars_por_kg: Number(cost.material_ars_por_kg),
        });

        if (!opts.dryRun) {
          const q = await client.query(
            `
            INSERT INTO app.item_formulado_snapshot
              (item_formulado_id, as_of_date, precio_unitario_ars, fuente, created_at)
            VALUES
              ($1::bigint, $2::date, $3::numeric, 'CRON'::text, now())
            ON CONFLICT (item_formulado_id, as_of_date)
            DO UPDATE SET
              precio_unitario_ars = excluded.precio_unitario_ars,
              fuente = excluded.fuente,
              created_at = excluded.created_at
            `,
            [item_formulado_id, asOfDate, cost.ars_por_kg]
          );
          upserts += q.rowCount ?? 0;
        }
      } catch (e: any) {
        errors.push({
          producto_id,
          error: String(e?.message ?? e),
        });
      }
    }

    return {
      ok: errors.length === 0,
      as_of_date: asOfDate,
      dry_run: opts.dryRun,
      producto_ids: opts.productoIds,
      computed: results.length,
      upserts,
      results,
      errors,
    };
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCronAuth(req);

    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") === "1";
    const productoIds = parseProductoIds(url.searchParams.get("producto_ids"));

    const payload = await run({ dryRun, productoIds });
    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: e?.statusCode ?? 500 }
    );
  }
}
