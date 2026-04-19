import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const tipo = String(body?.tipo ?? "").trim().toUpperCase();
    const id = numOrNull(body?.id);
    const densidad = numOrNull(body?.densidad_g_ml);
    if (!Number.isFinite(id as number) || Number(id) <= 0) {
      return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });
    }
    if (!Number.isFinite(densidad as number) || Number(densidad) <= 0) {
      return NextResponse.json({ ok: false, error: "densidad_g_ml inválida" }, { status: 422 });
    }

    const sql = db();

    if (tipo === "MANUAL") {
      const r: any = await sql.query(
        `UPDATE app.cost_option SET densidad_g_ml = $2 WHERE cost_option_id = $1 RETURNING cost_option_id`,
        [id, densidad]
      );
      const ok = Array.isArray(r?.rows) ? r.rows.length > 0 : Array.isArray(r) ? r.length > 0 : false;
      if (!ok) return NextResponse.json({ ok: false, error: "manual no encontrado" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    if (tipo === "FORMULADO") {
      const productoId = numOrNull(body?.producto_id);
      if (!Number.isFinite(productoId as number) || Number(productoId) <= 0) {
        return NextResponse.json({ ok: false, error: "producto_id inválido" }, { status: 400 });
      }
      const r: any = await sql.query(
        `UPDATE app.producto SET densidad_producto_g_ml = $2 WHERE producto_id = $1 RETURNING producto_id`,
        [productoId, densidad]
      );
      const ok = Array.isArray(r?.rows) ? r.rows.length > 0 : Array.isArray(r) ? r.length > 0 : false;
      if (!ok) return NextResponse.json({ ok: false, error: "producto no encontrado" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    if (tipo === "PROVEEDOR") {
      const refPresentacion = numOrNull(body?.ref_presentacion);
      if (!Number.isFinite(refPresentacion as number) || Number(refPresentacion) <= 0) {
        return NextResponse.json({ ok: false, error: "ref_presentacion inválida" }, { status: 400 });
      }
      await sql.query(
        `
        INSERT INTO app.cost_option (tipo, item_id, item_presentacion, densidad_g_ml)
        VALUES ('ITEM_PRESENTACION', $1, $2, $3)
        ON CONFLICT (tipo, item_id, item_presentacion)
        DO UPDATE SET densidad_g_ml = EXCLUDED.densidad_g_ml, updated_at = now()
        `,
        [id, refPresentacion, densidad]
      );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "tipo inválido" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
