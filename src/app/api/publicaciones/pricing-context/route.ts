import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function rows(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function num(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function familyOfUom(uom?: string | null): "mass" | "volume" | "unit" | null {
  const x = String(uom ?? "").trim().toUpperCase();
  if (x === "GR") return "mass";
  if (x === "ML") return "volume";
  if (x === "UN") return "unit";
  return null;
}

function normalizeToRefUnit(cantidad: number, unidad: string, refUom?: string | null, densidad?: number | null): number | null {
  const ru = String(refUom ?? "").toUpperCase();
  if (!["GR", "ML", "UN"].includes(ru)) return null;
  if (unidad === ru) return cantidad;
  if (unidad === "UN" || ru === "UN") return null;
  const d = Number(densidad ?? NaN);
  if (!Number.isFinite(d) || d <= 0) return null;
  if (unidad === "ML" && ru === "GR") return cantidad * d;
  if (unidad === "GR" && ru === "ML") return cantidad / d;
  return null;
}

type OriginRef = {
  ref_uom: string | null;
  ref_cantidad: number | null;
  costo_ref_ars: number | null;
  densidad_g_ml: number | null;
};

async function resolveOriginRef(sql: any, item: any): Promise<OriginRef> {
  if (item.manual_cost_option_id != null) {
    const r: any = await sql.query(
      `
      SELECT
        co.manual_uom as ref_uom,
        co.manual_cantidad::float8 as ref_cantidad,
        co.manual_costo_ars::float8 as costo_ref_ars,
        co.densidad_g_ml::float8 as densidad_g_ml
      FROM app.cost_option co
      WHERE co.cost_option_id = $1
      LIMIT 1
      `,
      [item.manual_cost_option_id]
    );
    const x = rows(r)[0] ?? {};
    return {
      ref_uom: x.ref_uom ?? null,
      ref_cantidad: num(x.ref_cantidad),
      costo_ref_ars: num(x.costo_ref_ars),
      densidad_g_ml: num(x.densidad_g_ml),
    };
  }

  if (item.proveedor_item_id != null) {
    const r: any = await sql.query(
      `
      WITH current_price AS (
        SELECT DISTINCT ON (ip.item_id)
          ip.item_id,
          ip.presentacion::float8 as presentacion,
          ip.price_ars::float8 as price_ars,
          ip.as_of_date
        FROM app.item_price_daily_pres ip
        WHERE ip.item_id = $1
        ORDER BY ip.item_id, ip.as_of_date DESC, ip.presentacion ASC
      ), current_density AS (
        SELECT DISTINCT ON (co.item_id)
          co.item_id,
          co.item_presentacion::float8 as item_presentacion,
          co.densidad_g_ml::float8 as densidad_g_ml
        FROM app.cost_option co
        WHERE co.tipo = 'ITEM_PRESENTACION'
          AND co.item_id = $1
        ORDER BY co.item_id, co.item_presentacion ASC, co.cost_option_id DESC
      )
      SELECT
        'GR'::text as ref_uom,
        case when cp.presentacion is not null then greatest(1::float8, cp.presentacion * 1000.0) else null::float8 end as ref_cantidad,
        cp.price_ars::float8 as costo_ref_ars,
        cd.densidad_g_ml::float8 as densidad_g_ml
      FROM current_price cp
      LEFT JOIN current_density cd
        ON cd.item_id = cp.item_id
       AND (cp.presentacion IS NULL OR cd.item_presentacion = cp.presentacion)
      LIMIT 1
      `,
      [item.proveedor_item_id]
    );
    const x = rows(r)[0] ?? {};
    return {
      ref_uom: x.ref_uom ?? null,
      ref_cantidad: num(x.ref_cantidad),
      costo_ref_ars: num(x.costo_ref_ars),
      densidad_g_ml: num(x.densidad_g_ml),
    };
  }

  if (item.formulado_item_formulado_id != null) {
    const r: any = await sql.query(
      `
      SELECT
        'GR'::text as ref_uom,
        1000::float8 as ref_cantidad,
        snap.precio_unitario_ars::float8 as costo_ref_ars,
        p.densidad_producto_g_ml::float8 as densidad_g_ml
      FROM app.item_formulado f
      JOIN app.producto p ON p.producto_id = f.producto_id
      LEFT JOIN LATERAL (
        SELECT s.precio_unitario_ars
        FROM app.item_formulado_snapshot s
        WHERE s.item_formulado_id = f.item_formulado_id
        ORDER BY s.as_of_date DESC, s.created_at DESC NULLS LAST, s.snapshot_id DESC
        LIMIT 1
      ) snap ON true
      WHERE f.item_formulado_id = $1
      LIMIT 1
      `,
      [item.formulado_item_formulado_id]
    );
    const x = rows(r)[0] ?? {};
    return {
      ref_uom: x.ref_uom ?? null,
      ref_cantidad: num(x.ref_cantidad),
      costo_ref_ars: num(x.costo_ref_ars),
      densidad_g_ml: num(x.densidad_g_ml),
    };
  }

  return { ref_uom: null, ref_cantidad: null, costo_ref_ars: null, densidad_g_ml: null };
}

async function computeCostoActual(sql: any, itemComercialId: number): Promise<number | null> {
  const r: any = await sql.query(
    `
    SELECT
      item_comercial_id,
      cantidad::float8 as cantidad,
      unidad,
      proveedor_item_id,
      manual_cost_option_id,
      formulado_item_formulado_id
    FROM app.item_comercial
    WHERE item_comercial_id = $1
    LIMIT 1
    `,
    [itemComercialId]
  );
  const item = rows(r)[0];
  if (!item) return null;

  const qty = num(item.cantidad);
  const unidad = String(item.unidad ?? "").toUpperCase();
  if (!Number.isFinite(qty) || !["GR", "ML", "UN"].includes(unidad)) return null;

  const origin = await resolveOriginRef(sql, item);
  let total = 0;

  if (origin.ref_uom && origin.ref_cantidad != null && origin.costo_ref_ars != null) {
    const qtyInRef = normalizeToRefUnit(Number(qty), unidad, origin.ref_uom, origin.densidad_g_ml);
    if (qtyInRef != null && origin.ref_cantidad > 0) {
      total += (qtyInRef / origin.ref_cantidad) * origin.costo_ref_ars;
    }
  }

  const env: any = await sql.query(
    `
    SELECT r.cantidad::float8 as cantidad, e.cantidad_referencia::float8 as cantidad_referencia, e.costo_ars::float8 as costo_ars
    FROM app.item_comercial_envase r
    JOIN app.item_envase e ON e.item_envase_id = r.item_envase_id
    WHERE r.item_comercial_id = $1
    `,
    [itemComercialId]
  );
  for (const x of rows(env)) {
    const cant = num(x.cantidad);
    const ref = num(x.cantidad_referencia);
    const costo = num(x.costo_ars);
    if (cant != null && ref != null && costo != null && ref > 0) {
      total += (cant / ref) * costo;
    }
  }

  const et: any = await sql.query(
    `
    SELECT r.cantidad::float8 as cantidad, e.cantidad_referencia::float8 as cantidad_referencia, e.costo_ars::float8 as costo_ars
    FROM app.item_comercial_etiqueta r
    JOIN app.item_etiqueta e ON e.item_etiqueta_id = r.item_etiqueta_id
    WHERE r.item_comercial_id = $1
    `,
    [itemComercialId]
  );
  for (const x of rows(et)) {
    const cant = num(x.cantidad);
    const ref = num(x.cantidad_referencia);
    const costo = num(x.costo_ars);
    if (cant != null && ref != null && costo != null && ref > 0) {
      total += (cant / ref) * costo;
    }
  }

  return total > 0 ? Number(total.toFixed(2)) : 0;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const itemComercialId = num(searchParams.get("item_comercial_id"));
    if (!Number.isFinite(itemComercialId)) {
      return NextResponse.json({ ok: false, error: "item_comercial_id inválido" }, { status: 400 });
    }

    const sql = db();

    const pr: any = await sql.query(
      `
      SELECT canal, precio_venta_ars
      FROM app.publicacion
      WHERE item_comercial_id = $1
      `,
      [itemComercialId]
    );

    const precios = {
      DIRECTO: null as number | null,
      WEB: null as number | null,
      MERCADO_LIBRE: null as number | null,
    };

    for (const r of rows(pr)) {
      const canal = String(r.canal ?? "").toUpperCase();
      const precio = num(r.precio_venta_ars);
      if (canal in precios) {
        (precios as any)[canal] = precio;
      }
    }

    const costo_referencia_ars = await computeCostoActual(sql, Number(itemComercialId));

    return NextResponse.json({
      ok: true,
      context: {
        costo_referencia_ars,
        precios,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
