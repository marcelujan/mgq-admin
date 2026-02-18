import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function intParam(u: URL, key: string, def: number, lo: number, hi: number) {
  const raw = u.searchParams.get(key);
  const n = raw === null ? def : Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

/**
 * GET /api/productos/bulks?search=&limit=&offset=
 *
 * "Bulk disponible" = existe fórmula (prioriza v2 si existe; fallback a tabla vieja).
 * Devuelve productos + densidad + ars_por_kg (calculado vía /api/productos/:id/costo-bulk).
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const search = (url.searchParams.get("search") ?? "").trim();
    const limit = intParam(url, "limit", 30, 1, 200);
    const offset = intParam(url, "offset", 0, 0, 100000);

    const sql = db();

    // 1) Obtener lista de productos "formulados" (con fórmula)
    // Intento v2 y si falla, fallback al esquema viejo.
    let productos: any[] = [];
    try {
      const r: any = await sql.query(
        `
        SELECT p.producto_id, p.nombre, p.densidad_producto_g_ml
        FROM app.producto p
        JOIN app.producto_formula_v2 f ON f.producto_id = p.producto_id
        WHERE ($1 = '' OR p.nombre ILIKE '%' || $1 || '%')
        ORDER BY p.nombre ASC
        LIMIT $2 OFFSET $3
        `,
        [search, limit, offset]
      );
      productos = normalizeQueryResult(r);
    } catch {
      const r: any = await sql.query(
        `
        SELECT p.producto_id, p.nombre, p.densidad_producto_g_ml
        FROM app.producto p
        JOIN app.producto_formula f ON f.producto_id = p.producto_id
        WHERE ($1 = '' OR p.nombre ILIKE '%' || $1 || '%')
        ORDER BY p.nombre ASC
        LIMIT $2 OFFSET $3
        `,
        [search, limit, offset]
      );
      productos = normalizeQueryResult(r);
    }

    // 2) Calcular ars_por_kg usando el endpoint existente costo-bulk (misma regla que el resto)
    const origin = req.nextUrl.origin;

    const rows = await Promise.all(
      productos.map(async (p) => {
        const producto_id = Number(p.producto_id);
        const nombre = String(p.nombre ?? "");
        const densidad_producto_g_ml = p.densidad_producto_g_ml === null || p.densidad_producto_g_ml === undefined ? null : Number(p.densidad_producto_g_ml);

        let ars_por_kg: number | null = null;

        try {
          const r = await fetch(`${origin}/api/productos/${producto_id}/costo-bulk`, { cache: "no-store" });
          const j = await r.json().catch(() => ({} as any));
          if (r.ok && j?.ok) {
            ars_por_kg = Number(j.ars_por_kg);
            if (!Number.isFinite(ars_por_kg)) ars_por_kg = null;
          }
        } catch {
          ars_por_kg = null;
        }

        return {
          producto_id,
          nombre,
          densidad_producto_g_ml: Number.isFinite(densidad_producto_g_ml as any) ? densidad_producto_g_ml : null,
          ars_por_kg,
        };
      })
    );

    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
