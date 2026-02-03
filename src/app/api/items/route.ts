import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const limitRaw = Number(searchParams.get("limit") ?? 50);
    const offsetRaw = Number(searchParams.get("offset") ?? 0);

    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 50;
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

    const search = (searchParams.get("search") ?? "").trim();
    const estado = (searchParams.get("estado") ?? "").trim();
    const seleccionadoRaw = (searchParams.get("seleccionado") ?? "").trim(); // "true" | "false" | ""

    let seleccionado: boolean | null = null;
    if (seleccionadoRaw === "true") seleccionado = true;
    if (seleccionadoRaw === "false") seleccionado = false;

    const where: string[] = [];
    const values: any[] = [];
    let p = 1;

    if (estado) {
      where.push(`i.estado = $${p++}`);
      values.push(estado);
    }

    if (seleccionado !== null) {
      where.push(`i.seleccionado = $${p++}`);
      values.push(seleccionado);
    }

    if (search) {
      // búsqueda simple por proveedor/nombre/url
      where.push(`(
        coalesce(p.nombre,'') ilike $${p} OR
        coalesce(p.codigo,'') ilike $${p} OR
        coalesce(i.url_original,'') ilike $${p}
      )`);
      values.push(`%${search}%`);
      p++;
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const sql = db();

    const r: any = await sql.query(
      `
      SELECT
        i.item_id,
        coalesce(p.codigo, '') as proveedor_codigo,
        coalesce(p.nombre, '') as proveedor_nombre,
        i.url_original,
        i.url_canonica,
        i.seleccionado,
        i.estado,
        i.created_at,
        i.updated_at
      FROM app.item_seguimiento i
      LEFT JOIN app.proveedor p
        ON p.proveedor_id = i.proveedor_id
      ${whereSql}
      ORDER BY i.item_id DESC
      LIMIT $${p} OFFSET $${p + 1}
      `,
      [...values, limit, offset]
    );

    const rows = normalizeQueryResult(r);

    return NextResponse.json({
      ok: true,
      count: rows.length,
      items: rows,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
