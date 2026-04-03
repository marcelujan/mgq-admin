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
    const d0 = await client.query<{ d: string }>(
      `select current_date::text as d;`,
    );
    const asOfDate = d0.rows[0]?.d;

    const rUniverse = await client.query<{
      producto_id: number;
      nombre: string;
      has_header: boolean;
      has_lines: boolean;
      item_formulado_id: number | null;
      has_snapshot_today: boolean;
    }>(
      `
      with productos_formulados_v2 as (
        select distinct producto_id
        from (
          select producto_id from app.producto_formula_v2
          union
          select producto_id from app.producto_formula_linea_v2
        ) x
        where producto_id is not null
      )
      select
        p.producto_id::int as producto_id,
        coalesce(p.nombre, '')::text as nombre,
        exists(
          select 1
          from app.producto_formula_v2 pf
          where pf.producto_id = p.producto_id
        ) as has_header,
        exists(
          select 1
          from app.producto_formula_linea_v2 pl
          where pl.producto_id = p.producto_id
        ) as has_lines,
        f.item_formulado_id::int as item_formulado_id,
        exists(
          select 1
          from app.item_formulado_snapshot s
          where s.item_formulado_id = f.item_formulado_id
            and s.as_of_date = current_date
        ) as has_snapshot_today
      from productos_formulados_v2 u
      join app.producto p on p.producto_id = u.producto_id
      left join lateral (
        select item_formulado_id
        from app.item_formulado f
        where f.producto_id = p.producto_id
          and f.tipo='BULK'
          and f.activo=true
        order by f.item_formulado_id asc
        limit 1
      ) f on true
      where p.activo = true
        and (
          $1::int[] is null
          or p.producto_id = any($1::int[])
        )
      order by p.producto_id asc
      `,
      [opts.productoIds],
    );

    const universeRows = rUniverse.rows ?? [];
    const cronCandidates = universeRows.filter((row) => row.has_header);
    const diagnostics = {
      universe_v2_count: universeRows.length,
      cron_candidate_count: cronCandidates.length,
      missing_header_count: universeRows.filter(
        (row) => !row.has_header && row.has_lines,
      ).length,
      missing_header_productos: universeRows
        .filter((row) => !row.has_header && row.has_lines)
        .slice(0, 50)
        .map((row) => ({
          producto_id: Number(row.producto_id),
          nombre: String(row.nombre ?? ""),
        })),
      pending_snapshot_today_count: universeRows.filter(
        (row) =>
          Number(row.item_formulado_id ?? 0) > 0 && !row.has_snapshot_today,
      ).length,
      pending_snapshot_today_productos: universeRows
        .filter(
          (row) =>
            Number(row.item_formulado_id ?? 0) > 0 && !row.has_snapshot_today,
        )
        .slice(0, 50)
        .map((row) => ({
          producto_id: Number(row.producto_id),
          nombre: String(row.nombre ?? ""),
          item_formulado_id: Number(row.item_formulado_id),
        })),
    };

    const results: any[] = [];
    const errors: any[] = [];
    let upserts = 0;

    for (const row of cronCandidates) {
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
            [item_formulado_id, asOfDate, cost.ars_por_kg],
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
      diagnostics,
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
      { status: e?.statusCode ?? 500 },
    );
  }
}
