import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export async function GET(req: NextRequest) {
  try {
    const DB = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    if (!DB) return NextResponse.json({ error: "Falta DATABASE_URL" }, { status: 500 });
    const sql = neon(DB);

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const onlyAct = searchParams.get("activos") === "true";
    const limit = Math.min(Number(searchParams.get("limit") || "50"), 200);
    const offset = Math.max(Number(searchParams.get("offset") || "0"), 0);

    const where: string[] = [];
    const params: any[] = [];

    if (q) { where.push('v."Prov Artículo" ILIKE $1'); params.push(`%${q}%`); }
    if (onlyAct) where.push('v."Prov Act" = TRUE');
    const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const dataQuery = `
      SELECT
        v."Prov Act" AS "Prov *",
        v."Prov Artículo",
        v."Prov Pres",
        v."Prov UOM",
        v."Prov Costo",
        v."Prov CostoUn",
        v."Prov URL",
        v."Prov Desc",
        v."Prov [g/mL]"
      FROM app.v_prov_min v
      ${whereSQL}
      ORDER BY v."Prov Artículo" NULLS LAST
      LIMIT ${limit} OFFSET ${offset}`;

    const countQuery = `
      SELECT COUNT(*)::bigint AS total
      FROM app.v_prov_min v
      ${whereSQL}`;

    const rows = await sql(dataQuery, params as any);
    const totalRes = await sql(countQuery, params as any);
    return NextResponse.json({ rows, total: Number(totalRes[0]?.total || 0) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
