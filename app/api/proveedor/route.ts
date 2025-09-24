import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export async function GET(req: NextRequest) {
  try {
    const DB = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    if (!DB) return NextResponse.json({ error: "Falta DATABASE_URL" }, { status: 500 });
    const sql = neon(DB);

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const limit = Math.min(Number(searchParams.get("limit") || "100"), 500);
    const offset = Math.max(Number(searchParams.get("offset") || "0"), 0);

    const where: string[] = [];
    const params: any[] = [];
    const paramsCount: any[] = [];
    let i = 1;
    let j = 1;

    if (q) {
      where.push(`prov_articulo ILIKE $${i++}`);
      params.push(`%${q}%`);
      paramsCount.push(`%${q}%`);
    }

    const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const dataQuery = `
      SELECT
        prov_favoritos  AS "Prov *",
        prov_articulo   AS "Prov Artículo",
        prov_presentacion AS "Prov Pres",
        prov_uom        AS "Prov UOM",
        prov_costo      AS "Prov Costo",
        prov_costoun    AS "Prov CostoUn",
        to_char(prov_act, 'DD/MM/YYYY') AS "Prov Act",
        prov_url        AS "Prov URL",
        prov_descripcion AS "Prov Desc",
        prov_densidad   AS "Prov [g/mL]",
        id              AS "_id"
      FROM app.proveedor
      ${whereSQL}
      ORDER BY "Prov Artículo" NULLS LAST
      LIMIT $${i++} OFFSET $${i++};
    `;

    // add limit/offset as params
    params.push(limit, offset);

    const countQuery = `
      SELECT COUNT(*)::bigint AS total
      FROM app.proveedor
      ${whereSQL};
    `;

    const rows = await sql(dataQuery, params as any);
    const totalRes = await sql(countQuery, paramsCount as any);
    return NextResponse.json({ rows, total: Number(totalRes[0]?.total || 0) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}