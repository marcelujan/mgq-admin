import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function upsertManualSnapshotToday(
  sql: any,
  cost_option_id: number,
  costo_ars: number,
  fuente: "USER" | "CRON" | "AUTO" = "USER"
) {
  // Requiere UNIQUE(cost_option_id, as_of_date)
  await sql.query(
    `
    insert into app.cost_option_snapshot (cost_option_id, as_of_date, costo_ars, fuente, created_at)
    values ($1, current_date, $2, $3::text, now())
    on conflict (cost_option_id, as_of_date)
    do update set
      costo_ars = excluded.costo_ars,
      fuente = excluded.fuente,
      created_at = excluded.created_at
    `,
    [cost_option_id, costo_ars, fuente]
  );
}

/**
 * GET:
 * - ITEM_PRESENTACION: desde app.item_price_daily_pres (última fecha por item/presentación) + app.item_seguimiento + app.proveedor
 * - MANUAL/BULK: desde app.cost_option
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") ?? "").trim();
    const soloSeleccionados = (searchParams.get("solo_seleccionados") ?? "true").trim() !== "false";
    const limitRaw = Number(searchParams.get("limit") ?? 300);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : 300;

    const sql = db();

    const itemParams: any[] = [];
    let whereItem = "WHERE 1=1";
    if (soloSeleccionados) whereItem += " AND i.seleccionado=true AND i.estado='OK'";
    if (search) {
      itemParams.push(`%${search}%`);
      const p = itemParams.length;
      whereItem += ` AND (
        coalesce(pv.nombre,'') ILIKE $${p} OR
        coalesce(pv.codigo,'') ILIKE $${p} OR
        coalesce(i.url_original,'') ILIKE $${p} OR
        coalesce(i.url_canonica,'') ILIKE $${p}
      )`;
    }

    const itemsRes: any = await sql.query(
      `
      WITH last_rows AS (
        SELECT item_id, presentacion, max(as_of_date) as max_date
        FROM app.item_price_daily_pres
        GROUP BY item_id, presentacion
      )
      SELECT
        i.item_id,
        coalesce(pv.codigo,'') as proveedor_codigo,
        coalesce(pv.nombre,'') as proveedor_nombre,
        i.url_original,
        i.url_canonica,
        lr.presentacion::float8 as presentacion,
        ip.price_ars::float8 as price_ars,
        lr.max_date::text as as_of_date
      FROM app.item_seguimiento i
      LEFT JOIN app.proveedor pv ON pv.proveedor_id = i.proveedor_id
      JOIN last_rows lr ON lr.item_id = i.item_id
      JOIN app.item_price_daily_pres ip
        ON ip.item_id = lr.item_id AND ip.presentacion = lr.presentacion AND ip.as_of_date = lr.max_date
      ${whereItem}
      ORDER BY pv.nombre ASC NULLS LAST, i.item_id DESC, lr.presentacion ASC
      LIMIT ${Number(limit)}
      `,
      itemParams
    );

    const item_options = normalizeQueryResult(itemsRes).map((r) => ({
      tipo: "ITEM_PRESENTACION" as const,
      item_id: Number(r.item_id),
      presentacion: Number(r.presentacion),
      price_ars: Number(r.price_ars),
      as_of_date: String(r.as_of_date ?? ""),
      proveedor_codigo: String(r.proveedor_codigo ?? ""),
      proveedor_nombre: String(r.proveedor_nombre ?? ""),
      url_original: String(r.url_original ?? ""),
      url_canonica: String(r.url_canonica ?? ""),
    }));

    const costOptParams: any[] = [];
    let whereCO = "WHERE activo=true AND tipo in ('MANUAL_PRESENTACION','BULK_PRODUCTO','ITEM_PRESENTACION')";
    if (search) {
      costOptParams.push(`%${search}%`);
      const p = costOptParams.length;
      whereCO += ` AND (
        coalesce(manual_nombre,'') ILIKE $${p}
      )`;
    }

    const coRes: any = await sql.query(
      `
      SELECT
        cost_option_id, tipo,
        item_id, item_presentacion,
        manual_nombre, manual_uom, manual_cantidad, manual_costo_ars,
        bulk_producto_id,
        densidad_g_ml,
        activo
      FROM app.cost_option
      ${whereCO}
      ORDER BY tipo ASC, manual_nombre ASC NULLS LAST, cost_option_id DESC
      LIMIT 800
      `,
      costOptParams
    );

    return NextResponse.json({
      ok: true,
      item_options,
      cost_options_extra: normalizeQueryResult(coRes),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

/**
 * POST /api/cost-options
 * Crea (o devuelve existente) cost_option.
 *
 * Body según tipo:
 * - ITEM_PRESENTACION: { tipo, item_id, item_presentacion, densidad_g_ml? }
 * - MANUAL_PRESENTACION: { tipo, manual_nombre, manual_uom, manual_cantidad, manual_costo_ars, densidad_g_ml? }
 * - BULK_PRODUCTO: { tipo, bulk_producto_id, densidad_g_ml? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const tipo = String(body?.tipo ?? "").trim();

    if (!["ITEM_PRESENTACION", "MANUAL_PRESENTACION", "BULK_PRODUCTO"].includes(tipo)) {
      return NextResponse.json({ ok: false, error: "tipo inválido" }, { status: 400 });
    }

    const densidad_g_ml = numOrNull(body?.densidad_g_ml);
    const sql = db();

    if (tipo === "ITEM_PRESENTACION") {
      const item_id = Number(body?.item_id);
      const item_presentacion = Number(body?.item_presentacion);
      if (!Number.isFinite(item_id) || !Number.isFinite(item_presentacion)) {
        return NextResponse.json({ ok: false, error: "item_id/item_presentacion inválidos" }, { status: 400 });
      }

      const r: any = await sql.query(
        `
        INSERT INTO app.cost_option (tipo, item_id, item_presentacion, densidad_g_ml)
        VALUES ('ITEM_PRESENTACION', $1, $2, $3)
        ON CONFLICT (tipo, item_id, item_presentacion)
        DO UPDATE SET
          densidad_g_ml = coalesce(excluded.densidad_g_ml, app.cost_option.densidad_g_ml),
          activo = true,
          updated_at = now()
        RETURNING cost_option_id
        `,
        [item_id, item_presentacion, densidad_g_ml]
      );
      const rows = normalizeQueryResult(r);
      return NextResponse.json({ ok: true, cost_option_id: Number(rows?.[0]?.cost_option_id) });
    }

    if (tipo === "MANUAL_PRESENTACION") {
      const manual_nombre = String(body?.manual_nombre ?? "").trim();

      // CAMBIO FUNCIONAL: normalizar a mayúsculas para tolerar "un"/" Un "
      const manual_uom = String(body?.manual_uom ?? "").trim().toUpperCase();

      const manual_cantidad = numOrNull(body?.manual_cantidad);
      const manual_costo_ars = numOrNull(body?.manual_costo_ars);

      if (!manual_nombre) return NextResponse.json({ ok: false, error: "manual_nombre requerido" }, { status: 400 });
      if (!["GR", "ML", "UN"].includes(manual_uom))
        return NextResponse.json({ ok: false, error: "manual_uom inválido" }, { status: 400 });
      if (manual_cantidad === null || manual_cantidad <= 0)
        return NextResponse.json({ ok: false, error: "manual_cantidad inválida" }, { status: 400 });
      if (manual_costo_ars === null || manual_costo_ars < 0)
        return NextResponse.json({ ok: false, error: "manual_costo_ars inválido" }, { status: 400 });

      const r: any = await sql.query(
        `
        INSERT INTO app.cost_option (tipo, manual_nombre, manual_uom, manual_cantidad, manual_costo_ars, densidad_g_ml)
        VALUES ('MANUAL_PRESENTACION', $1, $2, $3, $4, $5)
        ON CONFLICT (tipo, manual_nombre, manual_uom, manual_cantidad)
        DO UPDATE SET
          manual_costo_ars = excluded.manual_costo_ars,
          densidad_g_ml = coalesce(excluded.densidad_g_ml, app.cost_option.densidad_g_ml),
          activo = true,
          updated_at = now()
        RETURNING cost_option_id
        `,
        [manual_nombre, manual_uom, manual_cantidad, manual_costo_ars, densidad_g_ml]
      );

      const rows = normalizeQueryResult(r);
      const cost_option_id = Number(rows?.[0]?.cost_option_id);

      if (!Number.isFinite(cost_option_id) || cost_option_id <= 0) {
        return NextResponse.json({ ok: false, error: "no se pudo crear cost_option" }, { status: 500 });
      }

      // ✅ Snapshot inmediato: garantiza que el manual nuevo tenga gráfico hoy
      await upsertManualSnapshotToday(sql, cost_option_id, manual_costo_ars, "USER");

      return NextResponse.json({ ok: true, cost_option_id });
    }

    // BULK_PRODUCTO
    const bulk_producto_id = Number(body?.bulk_producto_id);
    if (!Number.isFinite(bulk_producto_id)) {
      return NextResponse.json({ ok: false, error: "bulk_producto_id inválido" }, { status: 400 });
    }

    const r: any = await sql.query(
      `
      INSERT INTO app.cost_option (tipo, bulk_producto_id, densidad_g_ml)
      VALUES ('BULK_PRODUCTO', $1, $2)
      ON CONFLICT (tipo, bulk_producto_id)
      DO UPDATE SET
        densidad_g_ml = coalesce(excluded.densidad_g_ml, app.cost_option.densidad_g_ml),
        activo = true,
        updated_at = now()
      RETURNING cost_option_id
      `,
      [bulk_producto_id, densidad_g_ml]
    );
    const rows = normalizeQueryResult(r);
    return NextResponse.json({ ok: true, cost_option_id: Number(rows?.[0]?.cost_option_id) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}