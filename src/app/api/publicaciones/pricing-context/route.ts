import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function rows(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function num(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const item_comercial_id = num(searchParams.get("item_comercial_id"));
    if (!Number.isFinite(item_comercial_id)) {
      return NextResponse.json({ ok: false, error: "item_comercial_id inválido" }, { status: 400 });
    }

    const sql = db();

    const pr: any = await sql.query(
      `
      SELECT canal, precio_venta_ars
      FROM app.publicacion
      WHERE item_comercial_id = $1
      `,
      [item_comercial_id]
    );
    const map = {
      DIRECTO: null as number | null,
      WEB: null as number | null,
      MERCADO_LIBRE: null as number | null,
    };
    for (const r of rows(pr)) {
      const canal = String(r.canal ?? "").toUpperCase();
      const precio = r.precio_venta_ars == null ? null : Number(r.precio_venta_ars);
      if (canal in map && Number.isFinite(Number(precio))) {
        (map as any)[canal] = Number(precio);
      }
    }

    let costo_referencia_ars: number | null = null;

    // 1) intentar tabla opcional de pricing, si existe
    try {
      const c1: any = await sql.query(
        `
        SELECT costo_referencia_ars
        FROM app.item_comercial_pricing
        WHERE item_comercial_id = $1
        LIMIT 1
        `,
        [item_comercial_id]
      );
      const rr = rows(c1)[0];
      if (rr && rr.costo_referencia_ars != null) {
        const x = Number(rr.costo_referencia_ars);
        if (Number.isFinite(x)) costo_referencia_ars = x;
      }
    } catch {
      // ignorar si la tabla no existe o no está aplicada
    }

    return NextResponse.json({
      ok: true,
      context: {
        costo_referencia_ars,
        precios: map,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
