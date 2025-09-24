import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export async function GET(req: NextRequest) {
  try {
    const DB = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    if (!DB) return NextResponse.json({ error: "Falta DATABASE_URL" }, { status: 500 });
    const sql = neon(DB);

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const onlyActivos = (searchParams.get("activos") || "").toLowerCase() === "true";
    const limit = Math.min(Number(searchParams.get("limit") || "100"), 500);
    const offset = Math.max(Number(searchParams.get("offset") || "0"), 0);

    const where: string[] = [];
    const params: any[] = [];
    const paramsCount: any[] = [];
    let i = 1;

    if (q) {
      where.push(`prov_articulo ILIKE $${i++}`);
      params.push(`%${q}%`);
      paramsCount.push(`%${q}%`);
    }
    if (onlyActivos) {
      where.push(`prov_favoritos = true`);
    }

    const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const dataQuery = `
      SELECT
        prov_favoritos      AS "Prov *",
        prov_articulo       AS "Prov Artículo",
        prov_presentacion   AS "Prov Pres",
        prov_uom            AS "Prov UOM",
        prov_costo          AS "Prov Costo",
        prov_costoun        AS "Prov CostoUn",
        to_char(prov_act, 'DD/MM/YYYY') AS "Prov Act",
        prov_url            AS "Prov URL",
        prov_descripcion    AS "Prov Desc",
        prov_densidad       AS "Prov [g/mL]",
        prov_id             AS "_prov_id",
        prov_id             AS "_id",                 -- compat UI
        product_id          AS "_product_id",
        product_presentation_id AS "_pp_id"
      FROM app.proveedor
      ${whereSQL}
      ORDER BY "Prov Artículo" NULLS LAST
      LIMIT $${i++} OFFSET $${i++};
    `;

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

export async function POST(req: NextRequest) {
  try {
    const DB = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    if (!DB) return NextResponse.json({ error: "Falta DATABASE_URL" }, { status: 500 });
    const sql = neon(DB);

    const body = await req.json();

    // Acepta id con distintos nombres
    const idRaw = body?.prov_id ?? body?._prov_id ?? body?.id ?? body?._id;
    let id = Number(idRaw);
    const ppId = Number(body?._pp_id ?? body?.product_presentation_id);
    const productId = Number(body?._product_id ?? body?.product_id);

    let row;
    if (Number.isFinite(id)) {
      row = (await sql(`SELECT prov_id, prov_favoritos FROM app.proveedor WHERE prov_id = $1 LIMIT 1`, [id]))?.[0];
    } else if (Number.isFinite(ppId) || Number.isFinite(productId)) {
      const params:any[] = [];
      const conds:string[] = [];
      if (Number.isFinite(ppId)) { conds.push(`product_presentation_id = $${params.push(ppId)}`); }
      if (Number.isFinite(productId)) { conds.push(`product_id = $${params.push(productId)}`); }
      const q = `SELECT prov_id, prov_favoritos FROM app.proveedor WHERE ${conds.join(" AND ")} LIMIT 1`;
      row = (await sql(q, params))?.[0];
    }

    if (!row?.prov_id) {
      return NextResponse.json({ error: "no se encontró la fila para toggle" }, { status: 404 });
    }

    const valueRaw = body?.value;
    let next: boolean;
    if (typeof valueRaw === "boolean") {
      next = valueRaw;
    } else {
      const current = Boolean(row.prov_favoritos);
      next = !current;
    }

    await sql(`UPDATE app.proveedor SET prov_favoritos = $1 WHERE prov_id = $2`, [next, row.prov_id]);
    return NextResponse.json({ ok: true, prov_id: row.prov_id, value: next });
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}