import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

async function parseIdValue(req: NextRequest): Promise<{ id: number | null, value: boolean | "toggle" | null }> {
  const url = new URL(req.url);
  const sp = url.searchParams;

  let body: any = null;
  try { body = await req.json(); } catch {}

  let form: FormData | null = null;
  try { form = await req.formData(); } catch {}

  const pick = (obj:any, keys:string[]) => {
    for (const k of keys) {
      const v = obj && obj[k];
      if (v !== undefined && v !== null && `${v}`.length > 0) return v;
    }
    return undefined;
  };

  const idRaw =
    pick(body, ["prov_id","_prov_id","id","_id"]) ??
    sp.get("prov_id") ?? sp.get("_prov_id") ?? sp.get("id") ?? sp.get("_id") ??
    (form ? (form.get("prov_id") ?? form.get("_prov_id") ?? form.get("id") ?? form.get("_id")) : null);

  const productIdRaw =
    pick(body, ["_product_id","product_id"]) ??
    sp.get("_product_id") ?? sp.get("product_id") ??
    (form ? (form.get("_product_id") ?? form.get("product_id")) : null);

  const valueRaw =
    pick(body, ["value"]) ?? sp.get("value") ?? (form ? form.get("value") : null);

  let id = Number(idRaw);
  if (!Number.isFinite(id)) id = NaN;

  let value: boolean | "toggle" | null = null;
  if (typeof valueRaw === "string") {
    const s = valueRaw.toLowerCase();
    if (s === "true" || s === "1") value = true;
    else if (s === "false" || s === "0") value = false;
    else value = "toggle";
  } else if (typeof valueRaw === "boolean") {
    value = valueRaw;
  } else {
    value = null;
  }

  if (!Number.isFinite(id)) {
    const ppId = Number(ppIdRaw);
    const productId = Number(productIdRaw);
    if (Number.isFinite(ppId) || Number.isFinite(productId)) {
      try {
        const DB = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
        const sql = neon(DB!);
        const params:any[] = [];
        const conds:string[] = [];
        if (Number.isFinite(ppId)) conds.push(`prov_presentacion = $${params.push(ppId)}`);
        if (Number.isFinite(productId)) conds.push(`product_id = $${params.push(productId)}`);
        const q = `SELECT prov_id FROM app.proveedor WHERE ${conds.join(" AND ")} LIMIT 1`;
        const found:any[] = await sql(q, params as any);
        if (found?.[0]?.prov_id) id = Number(found[0].prov_id);
      } catch {}
    }
  }

  return { id: Number.isFinite(id) ? id : null, value };
}

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
        prov_id             AS "_id",
        product_id          AS "_product_id",
        prov_presentacion AS "_pp_id"
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

    const { id, value } = await parseIdValue(req);
    if (id == null) return NextResponse.json({ error: "id no encontrado" }, { status: 400 });

    const cur = await sql(`SELECT prov_favoritos FROM app.proveedor WHERE prov_id = $1`, [id]);
    if (!cur?.[0]) return NextResponse.json({ error: "fila inexistente" }, { status: 404 });
    const next = (value === null || value === "toggle") ? !Boolean(cur[0].prov_favoritos) : Boolean(value);

    await sql(`UPDATE app.proveedor SET prov_favoritos = $1 WHERE prov_id = $2`, [next, id]);
    return NextResponse.json({ ok: true, prov_id: id, value: next });
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  return POST(req);
}

export async function PUT(req: NextRequest) {
  return POST(req);
}