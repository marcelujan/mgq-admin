import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const item_formulado_id = Number(searchParams.get("formulado_item_formulado_id") ?? "");
    if (!Number.isFinite(item_formulado_id) || item_formulado_id <= 0) {
      return NextResponse.json({ ok: false, error: "formulado_item_formulado_id inválido" }, { status: 400 });
    }
    const sql = db();
    const outRes: any = await sql.query(
      `
      SELECT f.item_formulado_id, f.producto_id, p.nombre, p.densidad_producto_g_ml::float8 as densidad_g_ml,
             COALESCE(pf.lote_ref_g::float8, 1000::float8) as lote_ref_g
      FROM app.item_formulado f
      JOIN app.producto p ON p.producto_id = f.producto_id
      LEFT JOIN app.producto_formula_v2 pf ON pf.producto_id = f.producto_id
      WHERE f.item_formulado_id = $1 AND f.activo = true AND f.tipo = 'BULK'
      LIMIT 1
      `,
      [item_formulado_id]
    );
    const out = rowsOf(outRes)[0] ?? null;
    if (!out) return NextResponse.json({ ok: false, error: "formulado no encontrado" }, { status: 404 });

    const linesRes: any = await sql.query(
      `
      WITH current_density AS (
        SELECT DISTINCT ON (co.item_id)
          co.item_id,
          co.densidad_g_ml::float8 as densidad_g_ml
        FROM app.cost_option co
        WHERE co.tipo = 'ITEM_PRESENTACION'
        ORDER BY co.item_id, co.cost_option_id DESC
      )
      SELECT
        l.linea_id,
        l.pct_peso::float8 as pct_peso,
        co.tipo,
        co.cost_option_id::bigint as cost_option_id,
        co.item_id::bigint as item_id,
        co.manual_nombre,
        co.manual_uom,
        co.manual_cantidad::float8 as manual_cantidad,
        co.manual_costo_ars::float8 as manual_costo_ars,
        co.densidad_g_ml::float8 as manual_densidad_g_ml,
        co.bulk_producto_id::bigint as bulk_producto_id,
        trim(both ' ' from concat_ws(' · ', prov.nombre, nullif(iseg.descripcion_fuente,''), 'Item #' || iseg.item_id::text)) as proveedor_label,
        trim(both ' ' from concat_ws(' · ', 'Manual', coalesce(co.manual_nombre,''), 'ID ' || co.cost_option_id::text)) as manual_label,
        trim(both ' ' from concat_ws(' · ', 'Formulado', coalesce(pb.nombre,''), 'ID ' || ifb.item_formulado_id::text)) as bulk_label,
        cd.densidad_g_ml::float8 as proveedor_densidad_g_ml,
        pb.densidad_producto_g_ml::float8 as bulk_densidad_g_ml,
        ifb.item_formulado_id::bigint as bulk_item_formulado_id
      FROM app.producto_formula_linea_v2 l
      JOIN app.cost_option co ON co.cost_option_id = l.cost_option_id
      LEFT JOIN app.item_seguimiento iseg ON iseg.item_id = co.item_id
      LEFT JOIN app.proveedor prov ON prov.proveedor_id = iseg.proveedor_id
      LEFT JOIN current_density cd ON cd.item_id = co.item_id
      LEFT JOIN app.producto pb ON pb.producto_id = co.bulk_producto_id
      LEFT JOIN app.item_formulado ifb ON ifb.producto_id = co.bulk_producto_id AND ifb.tipo = 'BULK' AND ifb.activo = true
      WHERE l.producto_id = $1
      ORDER BY l.orden ASC, l.linea_id ASC
      `,
      [Number(out.producto_id)]
    );

    const loteRef = Number(out.lote_ref_g ?? 1000);
    const consumos = rowsOf(linesRes).flatMap((r: any) => {
      const pct = Number(r.pct_peso ?? 0);
      const masaTeoricaG = loteRef > 0 ? (loteRef * pct) / 100 : 0;
      if (String(r.tipo) === 'ITEM_PRESENTACION' && r.item_id) {
        return [{
          item_tipo: 'PROVEEDOR',
          item_ref_id: Number(r.item_id),
          nombre: r.proveedor_label || `Item #${r.item_id}`,
          label: r.proveedor_label || `Item #${r.item_id}`,
          uom: 'GR',
          densidad_g_ml: r.proveedor_densidad_g_ml ?? null,
          cantidad: masaTeoricaG,
        }];
      }
      if (String(r.tipo) === 'MANUAL_PRESENTACION' && r.cost_option_id) {
        const manualUom = String(r.manual_uom ?? '').toUpperCase();
        const dens = r.manual_densidad_g_ml != null ? Number(r.manual_densidad_g_ml) : null;
        let cantidad = masaTeoricaG;
        if (manualUom === 'ML' && dens && dens > 0) cantidad = masaTeoricaG / dens;
        else if (manualUom === 'UN') cantidad = 1;
        return [{
          item_tipo: 'MANUAL',
          item_ref_id: Number(r.cost_option_id),
          nombre: r.manual_label || `Manual #${r.cost_option_id}`,
          label: r.manual_label || `Manual #${r.cost_option_id}`,
          uom: r.manual_uom || null,
          densidad_g_ml: dens,
          cantidad,
        }];
      }
      if (String(r.tipo) === 'BULK_PRODUCTO' && r.bulk_item_formulado_id) {
        return [{
          item_tipo: 'FORMULADO',
          item_ref_id: Number(r.bulk_item_formulado_id),
          nombre: r.bulk_label || `Formulado #${r.bulk_item_formulado_id}`,
          label: r.bulk_label || `Formulado #${r.bulk_item_formulado_id}`,
          uom: 'GR',
          densidad_g_ml: r.bulk_densidad_g_ml ?? null,
          cantidad: masaTeoricaG,
        }];
      }
      return [];
    });

    return NextResponse.json({ ok: true, lote_ref_g: loteRef, consumos });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'error' }, { status: 500 });
  }
}
