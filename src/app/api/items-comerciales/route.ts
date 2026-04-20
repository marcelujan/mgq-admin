import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

type Estado = "BORRADOR" | "OFERTABLE" | "CON_FALTANTES" | "BLOQUEADO";

type OriginInfo = {
  origin_uom: string | null;
  densidad_g_ml: number | null;
  saldo: number;
};

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function countOrigins(proveedor_item_id: number | null, manual_cost_option_id: number | null, formulado_item_formulado_id: number | null): number {
  return Number(proveedor_item_id !== null) + Number(manual_cost_option_id !== null) + Number(formulado_item_formulado_id !== null);
}

function familyOfUom(uom: string | null | undefined): "mass" | "volume" | "unit" | null {
  const x = String(uom ?? "").trim().toUpperCase();
  if (x === "GR") return "mass";
  if (x === "ML") return "volume";
  if (x === "UN") return "unit";
  return null;
}

function unitsAreCompatible(itemUom: string, refUom: string | null | undefined): boolean {
  const fromFamily = familyOfUom(refUom);
  const toFamily = familyOfUom(itemUom);
  if (!fromFamily || !toFamily) return true;
  if (fromFamily === "unit" || toFamily === "unit") return fromFamily === toFamily;
  return true;
}

async function resolveOriginRefUom(sql: any, proveedor_item_id: number | null, manual_cost_option_id: number | null, formulado_item_formulado_id: number | null): Promise<string | null> {
  if (proveedor_item_id !== null) {
    const r: any = await sql.query(`SELECT 'GR'::text as uom FROM app.item_seguimiento WHERE item_id = $1`, [proveedor_item_id]);
    return normalizeQueryResult(r)?.[0]?.uom ?? null;
  }
  if (manual_cost_option_id !== null) {
    const r: any = await sql.query(`SELECT manual_uom as uom FROM app.cost_option WHERE cost_option_id = $1`, [manual_cost_option_id]);
    return normalizeQueryResult(r)?.[0]?.uom ?? null;
  }
  if (formulado_item_formulado_id !== null) {
    const r: any = await sql.query(`SELECT 'GR'::text as uom FROM app.item_formulado WHERE item_formulado_id = $1`, [formulado_item_formulado_id]);
    return normalizeQueryResult(r)?.[0]?.uom ?? null;
  }
  return null;
}

function requiredOriginQty(params: { cantidad: number | null; unidad: string | null; origin_uom: string | null; densidad_g_ml: number | null; }): number | null {
  const cantidad = params.cantidad;
  const unidad = String(params.unidad ?? "").trim().toUpperCase() || null;
  const originUom = String(params.origin_uom ?? "").trim().toUpperCase() || null;
  const dens = Number(params.densidad_g_ml ?? 0);
  if (!(cantidad !== null && Number.isFinite(cantidad) && cantidad > 0)) return null;
  if (!unidad || !originUom) return null;
  if (unidad === originUom) return cantidad;
  const fu = familyOfUom(unidad);
  const fo = familyOfUom(originUom);
  if (!fu || !fo) return null;
  if (fu === "unit" || fo === "unit") return null;
  if (!(Number.isFinite(dens) && dens > 0)) return null;
  if (unidad === "ML" && originUom === "GR") return cantidad * dens;
  if (unidad === "GR" && originUom === "ML") return cantidad / dens;
  return null;
}

function parseNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function loadOriginInfoMaps(sql: any, rows: any[]) {
  const manualIds = Array.from(new Set(rows.map((r) => Number(r.manual_cost_option_id)).filter((x) => Number.isFinite(x) && x > 0)));
  const proveedorIds = Array.from(new Set(rows.map((r) => Number(r.proveedor_item_id)).filter((x) => Number.isFinite(x) && x > 0)));
  const formuladoIds = Array.from(new Set(rows.map((r) => Number(r.formulado_item_formulado_id)).filter((x) => Number.isFinite(x) && x > 0)));

  const manualMap = new Map<number, OriginInfo>();
  const proveedorMap = new Map<number, OriginInfo>();
  const formuladoMap = new Map<number, OriginInfo>();

  if (manualIds.length) {
    const r: any = await sql.query(
      `
      SELECT
        co.cost_option_id,
        co.manual_uom as origin_uom,
        co.densidad_g_ml::float8 as densidad_g_ml,
        coalesce(s.saldo, 0)::float8 as saldo
      FROM app.cost_option co
      LEFT JOIN app.stock_saldo_actual_v s ON s.item_tipo = 'MANUAL' AND s.item_ref_id = co.cost_option_id::text
      WHERE co.cost_option_id = ANY($1::bigint[])
      `,
      [manualIds]
    );
    for (const row of normalizeQueryResult(r)) {
      manualMap.set(Number(row.cost_option_id), {
        origin_uom: row.origin_uom ?? null,
        densidad_g_ml: parseNum(row.densidad_g_ml),
        saldo: Number(row.saldo ?? 0),
      });
    }
  }

  if (proveedorIds.length) {
    const r: any = await sql.query(
      `
      WITH current_density AS (
        SELECT DISTINCT ON (co.item_id)
          co.item_id,
          co.densidad_g_ml::float8 as densidad_g_ml
        FROM app.cost_option co
        WHERE co.tipo = 'ITEM_PRESENTACION'
          AND co.item_id = ANY($1::bigint[])
        ORDER BY co.item_id, co.item_presentacion ASC, co.cost_option_id DESC
      )
      SELECT
        i.item_id,
        'GR'::text as origin_uom,
        cd.densidad_g_ml::float8 as densidad_g_ml,
        coalesce(s.saldo, 0)::float8 as saldo
      FROM app.item_seguimiento i
      LEFT JOIN current_density cd ON cd.item_id = i.item_id
      LEFT JOIN app.stock_saldo_actual_v s ON s.item_tipo = 'PROVEEDOR' AND s.item_ref_id = i.item_id::text
      WHERE i.item_id = ANY($1::bigint[])
      `,
      [proveedorIds]
    );
    for (const row of normalizeQueryResult(r)) {
      proveedorMap.set(Number(row.item_id), {
        origin_uom: row.origin_uom ?? null,
        densidad_g_ml: parseNum(row.densidad_g_ml),
        saldo: Number(row.saldo ?? 0),
      });
    }
  }

  if (formuladoIds.length) {
    const r: any = await sql.query(
      `
      SELECT
        f.item_formulado_id,
        'GR'::text as origin_uom,
        p.densidad_producto_g_ml::float8 as densidad_g_ml,
        coalesce(s.saldo, 0)::float8 as saldo
      FROM app.item_formulado f
      JOIN app.producto p ON p.producto_id = f.producto_id
      LEFT JOIN app.stock_saldo_actual_v s ON s.item_tipo = 'FORMULADO' AND s.item_ref_id = f.item_formulado_id::text
      WHERE f.item_formulado_id = ANY($1::int[])
      `,
      [formuladoIds]
    );
    for (const row of normalizeQueryResult(r)) {
      formuladoMap.set(Number(row.item_formulado_id), {
        origin_uom: row.origin_uom ?? null,
        densidad_g_ml: parseNum(row.densidad_g_ml),
        saldo: Number(row.saldo ?? 0),
      });
    }
  }

  return { manualMap, proveedorMap, formuladoMap };
}

async function loadRelationStatsMaps(sql: any, itemIds: number[]) {
  const envWarnMap = new Map<number, number>();
  const etWarnMap = new Map<number, number>();
  const envSelMap = new Map<number, number>();
  const etSelMap = new Map<number, number>();
  if (!itemIds.length) return { envWarnMap, etWarnMap, envSelMap, etSelMap };

  const envR: any = await sql.query(
    `
    SELECT
      r.item_comercial_id,
      COUNT(*)::int as selected_count,
      COUNT(*) FILTER (WHERE coalesce(s.saldo, 0)::float8 < r.cantidad::float8)::int as faltantes_count
    FROM app.item_comercial_envase r
    LEFT JOIN app.stock_saldo_actual_v s ON s.item_tipo = 'ENVASE' AND s.item_ref_id = r.item_envase_id::text
    WHERE r.item_comercial_id = ANY($1::bigint[])
    GROUP BY r.item_comercial_id
    `,
    [itemIds]
  );
  for (const row of normalizeQueryResult(envR)) {
    envSelMap.set(Number(row.item_comercial_id), Number(row.selected_count ?? 0));
    envWarnMap.set(Number(row.item_comercial_id), Number(row.faltantes_count ?? 0));
  }

  const etR: any = await sql.query(
    `
    SELECT
      r.item_comercial_id,
      COUNT(*)::int as selected_count,
      COUNT(*) FILTER (WHERE coalesce(s.saldo, 0)::float8 < r.cantidad::float8)::int as faltantes_count
    FROM app.item_comercial_etiqueta r
    LEFT JOIN app.stock_saldo_actual_v s ON s.item_tipo = 'ETIQUETA' AND s.item_ref_id = r.item_etiqueta_id::text
    WHERE r.item_comercial_id = ANY($1::bigint[])
    GROUP BY r.item_comercial_id
    `,
    [itemIds]
  );
  for (const row of normalizeQueryResult(etR)) {
    etSelMap.set(Number(row.item_comercial_id), Number(row.selected_count ?? 0));
    etWarnMap.set(Number(row.item_comercial_id), Number(row.faltantes_count ?? 0));
  }

  return { envWarnMap, etWarnMap, envSelMap, etSelMap };
}

function calcEstado(row: any, origin: OriginInfo | undefined, warnEnv: number, warnEt: number, envSel: number, etSel: number): { estado: Estado; estado_detalle: string; warning_envases_count: number; warning_etiquetas_count: number; bulk_requerido: number | null; bulk_saldo: number | null; origin_uom: string | null; } {
  const nombre = typeof row?.nombre === "string" ? row.nombre.trim() : "";
  const cantidad = numOrNull(row?.cantidad);
  const unidad = row?.unidad ? String(row.unidad).trim().toUpperCase() : null;
  const proveedor_item_id = numOrNull(row?.proveedor_item_id);
  const manual_cost_option_id = numOrNull(row?.manual_cost_option_id);
  const formulado_item_formulado_id = numOrNull(row?.formulado_item_formulado_id);

  const resultBase = {
    warning_envases_count: warnEnv,
    warning_etiquetas_count: warnEt,
    bulk_requerido: null as number | null,
    bulk_saldo: origin ? Number(origin.saldo ?? 0) : null,
    origin_uom: origin?.origin_uom ?? null,
  };

  if (!nombre) return { estado: "BORRADOR", estado_detalle: "Falta nombre", ...resultBase };
  if (countOrigins(proveedor_item_id, manual_cost_option_id, formulado_item_formulado_id) !== 1) return { estado: "BORRADOR", estado_detalle: "Falta bulk", ...resultBase };
  if (!(cantidad !== null && Number.isFinite(cantidad) && cantidad > 0) || !unidad) return { estado: "BORRADOR", estado_detalle: "Falta cantidad o unidad", ...resultBase };
  if (!origin?.origin_uom) return { estado: "BORRADOR", estado_detalle: "Bulk incompleto", ...resultBase };
  if (!unitsAreCompatible(unidad, origin.origin_uom)) return { estado: "BORRADOR", estado_detalle: "Unidad incompatible con bulk", ...resultBase };

  const itemFamily = familyOfUom(unidad);
  const originFamily = familyOfUom(origin.origin_uom);
  const densityNeeded = !!itemFamily && !!originFamily && itemFamily !== originFamily && itemFamily !== "unit" && originFamily !== "unit";
  if (densityNeeded && !(Number(origin.densidad_g_ml ?? 0) > 0)) return { estado: "BORRADOR", estado_detalle: "Falta densidad", ...resultBase };
  if (envSel <= 0 || etSel <= 0) {
    const parts: string[] = [];
    if (envSel <= 0) parts.push("Falta seleccionar envase");
    if (etSel <= 0) parts.push("Falta seleccionar etiqueta");
    return { estado: "BORRADOR", estado_detalle: parts.join(" · "), ...resultBase };
  }

  const requerido = requiredOriginQty({ cantidad, unidad, origin_uom: origin.origin_uom, densidad_g_ml: origin.densidad_g_ml });
  if (!(requerido !== null && Number.isFinite(requerido) && requerido > 0)) return { estado: "BORRADOR", estado_detalle: "No se pudo calcular consumo de bulk", ...resultBase };
  if (Number(origin.saldo ?? 0) < requerido) return { estado: "BLOQUEADO", estado_detalle: "Falta stock de bulk", ...resultBase, bulk_requerido: requerido };
  if (warnEnv > 0 || warnEt > 0) {
    const parts: string[] = [];
    if (warnEnv > 0) parts.push(`${warnEnv} envase(s) sin stock`);
    if (warnEt > 0) parts.push(`${warnEt} etiqueta(s) sin stock`);
    return { estado: "CON_FALTANTES", estado_detalle: parts.join(" · "), ...resultBase, bulk_requerido: requerido };
  }

  return { estado: "OFERTABLE", estado_detalle: "Completo y con stock disponible", ...resultBase, bulk_requerido: requerido };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const includeInactivos = (searchParams.get("include_inactivos") ?? "false") === "true";
    const search = (searchParams.get("search") ?? "").trim();
    const estadoFilter = String(searchParams.get("estado") ?? "TODOS").trim().toUpperCase();
    const sql = db();

    const r: any = await sql.query(
      `
      SELECT
        c.item_comercial_id,
        c.nombre,
        c.descripcion,
        c.cantidad,
        c.unidad,
        c.proveedor_item_id,
        c.manual_cost_option_id,
        c.formulado_item_formulado_id,
        c.activo,
        c.created_at,
        c.updated_at,
        CASE
          WHEN c.proveedor_item_id IS NOT NULL THEN 'PROVEEDOR'
          WHEN c.manual_cost_option_id IS NOT NULL THEN 'MANUAL'
          WHEN c.formulado_item_formulado_id IS NOT NULL THEN 'FORMULADO'
          ELSE null
        END AS origen_tipo,
        CASE
          WHEN c.proveedor_item_id IS NOT NULL THEN c.proveedor_item_id
          WHEN c.manual_cost_option_id IS NOT NULL THEN c.manual_cost_option_id
          WHEN c.formulado_item_formulado_id IS NOT NULL THEN c.formulado_item_formulado_id::bigint
          ELSE null::bigint
        END AS origen_id,
        CASE
          WHEN c.proveedor_item_id IS NOT NULL THEN
            trim(both ' ' from concat_ws(' · ', coalesce(pr.nombre,''), nullif(i.descripcion_fuente,''), 'Item #' || i.item_id::text))
          WHEN c.manual_cost_option_id IS NOT NULL THEN
            trim(both ' ' from concat_ws(' · ', 'Manual', coalesce(co.manual_nombre,''), 'ID ' || co.cost_option_id::text))
          WHEN c.formulado_item_formulado_id IS NOT NULL THEN
            trim(both ' ' from concat_ws(' · ', 'Formulado', coalesce(p.nombre,''), 'ID ' || f.item_formulado_id::text))
          ELSE null::text
        END AS origen_label
      FROM app.item_comercial c
      LEFT JOIN app.item_seguimiento i ON i.item_id = c.proveedor_item_id
      LEFT JOIN app.proveedor pr ON pr.proveedor_id = i.proveedor_id
      LEFT JOIN app.cost_option co ON co.cost_option_id = c.manual_cost_option_id
      LEFT JOIN app.item_formulado f ON f.item_formulado_id = c.formulado_item_formulado_id
      LEFT JOIN app.producto p ON p.producto_id = f.producto_id
      WHERE (($1::boolean = true) OR (c.activo = true))
        AND (
          $2::text = '' OR
          coalesce(c.nombre,'') ILIKE '%' || $2::text || '%' OR
          coalesce(c.descripcion,'') ILIKE '%' || $2::text || '%' OR
          coalesce(i.descripcion_fuente,'') ILIKE '%' || $2::text || '%' OR
          coalesce(co.manual_nombre,'') ILIKE '%' || $2::text || '%' OR
          coalesce(p.nombre,'') ILIKE '%' || $2::text || '%'
        )
      ORDER BY c.activo DESC, c.nombre ASC, c.item_comercial_id ASC
      `,
      [includeInactivos, search]
    );

    const rows = normalizeQueryResult(r);
    const { manualMap, proveedorMap, formuladoMap } = await loadOriginInfoMaps(sql, rows);
    const itemIds = rows.map((x) => Number(x.item_comercial_id)).filter((x) => Number.isFinite(x) && x > 0);
    const { envWarnMap, etWarnMap, envSelMap, etSelMap } = await loadRelationStatsMaps(sql, itemIds);

    const items = rows.map((row) => {
      let origin: OriginInfo | undefined;
      if (row.manual_cost_option_id !== null && row.manual_cost_option_id !== undefined) origin = manualMap.get(Number(row.manual_cost_option_id));
      else if (row.proveedor_item_id !== null && row.proveedor_item_id !== undefined) origin = proveedorMap.get(Number(row.proveedor_item_id));
      else if (row.formulado_item_formulado_id !== null && row.formulado_item_formulado_id !== undefined) origin = formuladoMap.get(Number(row.formulado_item_formulado_id));
      const estado = calcEstado(
        row,
        origin,
        Number(envWarnMap.get(Number(row.item_comercial_id)) ?? 0),
        Number(etWarnMap.get(Number(row.item_comercial_id)) ?? 0),
        Number(envSelMap.get(Number(row.item_comercial_id)) ?? 0),
        Number(etSelMap.get(Number(row.item_comercial_id)) ?? 0),
      );
      return {
        ...row,
        ...estado,
      };
    }).filter((row) => estadoFilter === "TODOS" || row.estado === estadoFilter);

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
    const descripcion = typeof body?.descripcion === "string" ? body.descripcion.trim() : "";
    const cantidad = numOrNull(body?.cantidad);
    const unidadRaw = body?.unidad === null || body?.unidad === undefined || body?.unidad === "" ? null : String(body?.unidad ?? "").trim().toUpperCase();
    const unidad = (unidadRaw as string | null);
    const proveedor_item_id = numOrNull(body?.proveedor_item_id);
    const manual_cost_option_id = numOrNull(body?.manual_cost_option_id);
    const formulado_item_formulado_id = numOrNull(body?.formulado_item_formulado_id);
    const activo = body?.activo === false ? false : true;

    if (!nombre) return NextResponse.json({ ok: false, error: "nombre requerido" }, { status: 400 });
    if (cantidad !== null && (!Number.isFinite(cantidad as number) || Number(cantidad) <= 0)) {
      return NextResponse.json({ ok: false, error: "cantidad inválida" }, { status: 422 });
    }
    if (unidad !== null && !["GR", "ML", "UN"].includes(unidad)) {
      return NextResponse.json({ ok: false, error: "unidad inválida" }, { status: 422 });
    }
    if (unidad === "UN" && cantidad !== null && !Number.isInteger(Number(cantidad))) {
      return NextResponse.json({ ok: false, error: "UN requiere cantidad entera" }, { status: 422 });
    }
    if (countOrigins(proveedor_item_id, manual_cost_option_id, formulado_item_formulado_id) > 1) {
      return NextResponse.json({ ok: false, error: "origen técnico inválido" }, { status: 422 });
    }

    const sql = db();
    if (unidad !== null && countOrigins(proveedor_item_id, manual_cost_option_id, formulado_item_formulado_id) === 1) {
      const refUom = await resolveOriginRefUom(sql, proveedor_item_id, manual_cost_option_id, formulado_item_formulado_id);
      if (!unitsAreCompatible(unidad, refUom)) {
        return NextResponse.json({ ok: false, error: "La unidad del Item Comercial es incompatible con la unidad del bulk/origen técnico" }, { status: 422 });
      }
    }

    const r: any = await sql.query(
      `
      INSERT INTO app.item_comercial (nombre, descripcion, cantidad, unidad, proveedor_item_id, manual_cost_option_id, formulado_item_formulado_id, activo)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING item_comercial_id
      `,
      [nombre, descripcion || null, cantidad, unidad, proveedor_item_id, manual_cost_option_id, formulado_item_formulado_id, activo]
    );

    const item_comercial_id = normalizeQueryResult(r)?.[0]?.item_comercial_id;
    return NextResponse.json({ ok: true, item_comercial_id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
