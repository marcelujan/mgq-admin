import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export async function POST(req: NextRequest) {
  try {
    const DB = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    if (!DB) return NextResponse.json({ error: "Falta DATABASE_URL" }, { status: 500 });
    const sql = neon(DB);

    const body = await req.json();
    const id = Number(body?.prov_id ?? body?._prov_id ?? body?.id ?? body?._id);
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
    if (!row?.prov_id) return NextResponse.json({ error: "no se encontró la fila" }, { status: 404 });

    const next = typeof body?.value === "boolean" ? Boolean(body.value) : !Boolean(row.prov_favoritos);
    await sql(`UPDATE app.proveedor SET prov_favoritos = $1 WHERE prov_id = $2`, [next, row.prov_id]);
    return NextResponse.json({ ok: true, prov_id: row.prov_id, value: next });
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}