import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export async function GET(req: NextRequest) {
  try {
    const NEON_DATABASE_URL = process.env.NEON_DATABASE_URL;
    if (!NEON_DATABASE_URL) {
      return NextResponse.json({ error: "NEON_DATABASE_URL no está configurado" }, { status: 500 });
    }
    const sql = neon(NEON_DATABASE_URL);

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const onlyAct = searchParams.get("activos") === "true";
    const limit = Math.min(Number(searchParams.get("limit") || "50"), 200);
    const offset = Math.max(Number(searchParams.get("offset") || "0"), 0);

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (q) {
      whereClauses.push('(v."Prov Artículo" ILIKE $1 OR si.nombre_proveedor ILIKE $1)');
      params.push(`%${q}%`);
    }
    if (onlyAct) whereClauses.push('v."Prov Act" = TRUE');
    const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const dataQuery = `
      SELECT
        si.nombre_proveedor AS "Prov *",
        v."Prov Artículo",
        v."Prov Pres",
        v."Prov UOM",
        v."Prov Costo",
        v."Prov CostoUn",
        v."Prov Act",
        v."Prov URL",
        v."Prov Desc",
        v."Prov [g/mL]"
      FROM app.v_prov_min v
      LEFT JOIN src.supplier_items si
        ON si.url = v."Prov URL"
      ${whereSQL}
      ORDER BY v."Prov Artículo" NULLS LAST
      LIMIT ${limit} OFFSET ${offset}`;

    const countQuery = `
      SELECT COUNT(*)::bigint AS total
      FROM app.v_prov_min v
      LEFT JOIN src.supplier_items si
        ON si.url = v."Prov URL"
      ${whereSQL}`;

    const rows = await sql(dataQuery, params as any);
    const totalRes = await sql(countQuery, params as any);
    return NextResponse.json({ rows, total: Number(totalRes[0]?.total || 0) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
