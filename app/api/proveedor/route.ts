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
    let j = 1;

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

// Toggle favoritos from the same endpoint for compatibility with existing UI calls
export async function POST(req: NextRequest) {
  try {
    const DB = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    if (!DB) return NextResponse.json({ error: "Falta DATABASE_URL" }, { status: 500 });
    const sql = neon(DB);

    const body = await req.json();

    // Accept multiple shapes for compatibility
    const idRaw = body?.id ?? body?._id;
    let id = Number(idRaw);

    if (!Number.isFinite(id)) {
      // attempt to resolve via product/presentation composite if provided
      const productId = body?._product_id ?? body?.product_id;
      const ppId = body?._pp_id ?? body?.product_presentation_id;
      if (Number.isFinite(Number(ppId))) {
        // Find a row by joining back (best-effort)
        const found = await sql(`
          SELECT pv.id
          FROM app.proveedor pv
          JOIN app.product_presentations pp ON pp.id = pv.prov_presentacion::bigint
          WHERE pp.id = $1
          LIMIT 1
        `, [Number(ppId)]);
        if (found?.[0]?.id) id = Number(found[0].id);
      }
    }

    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 });
    }

    // value can be boolean or "toggle"
    const valueRaw = body?.value;
    let target: boolean | null = null;
    if (typeof valueRaw === "boolean") {
      target = valueRaw;
    } else if (typeof valueRaw === "string" && valueRaw.toLowerCase() === "toggle") {
      // fetch current and invert
      const cur = await sql(`SELECT prov_favoritos FROM app.proveedor WHERE id = $1`, [id]);
      const curVal = Boolean(cur?.[0]?.prov_favoritos);
      target = !curVal;
    } else {
      // default: toggle
      const cur = await sql(`SELECT prov_favoritos FROM app.proveedor WHERE id = $1`, [id]);
      const curVal = Boolean(cur?.[0]?.prov_favoritos);
      target = !curVal;
    }

    await sql(`UPDATE app.proveedor SET prov_favoritos = $1 WHERE id = $2`, [target, id]);
    return NextResponse.json({ ok: true, id, value: target });
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}