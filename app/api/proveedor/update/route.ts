import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

/**
 * Actualiza directamente columnas de app.proveedor.
 * Campos aceptados (opcionales): prov_presentacion, prov_uom, prov_costo, prov_url, prov_descripcion, prov_act, prov_favoritos.
 * Identificación: prov_id (preferido) o product_id.
 */
export async function POST(req: NextRequest) {
  try {
    const DB = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    if (!DB) return NextResponse.json({ error: "Falta DATABASE_URL" }, { status: 500 });
    const sql = neon(DB);

    const body = await req.json();

    const sets:string[] = [];
    const params:any[] = [];
    const addSet = (col:string, val:any) => { sets.push(`${col} = $${params.length+1}`); params.push(val); };

    if (typeof body?.prov_presentacion !== "undefined") addSet("prov_presentacion", Number(body.prov_presentacion) || null);
    if (typeof body?.prov_uom === "string") addSet("prov_uom", body.prov_uom);
    if (typeof body?.prov_costo !== "undefined") addSet("prov_costo", Number(body.prov_costo) || null);
    if (typeof body?.prov_costoun !== "undefined") addSet("prov_costoun", Number(body.prov_costoun) || null);
    if (typeof body?.prov_act === "string") addSet("prov_act", body.prov_act);
    if (typeof body?.prov_url === "string") addSet("prov_url", body.prov_url);
    if (typeof body?.prov_descripcion === "string") addSet("prov_descripcion", body.prov_descripcion);
    if (typeof body?.prov_favoritos !== "undefined") addSet("prov_favoritos", Boolean(body.prov_favoritos));
    if (typeof body?.prov_proveedor === "string") addSet("prov_proveedor", body.prov_proveedor);


    const prov_id = Number(body?.prov_id ?? body?._prov_id);
    const product_id = Number(body?.product_id ?? body?._product_id);

    if (!Number.isFinite(prov_id) && !Number.isFinite(product_id)) {
      return NextResponse.json({ error: "Falta prov_id o product_id" }, { status: 400 });
    }

    // Normalización de UOM
    let prov_uom: string | undefined = body?.prov_uom ?? body?.uom;
    if (typeof prov_uom === "string") {
      prov_uom = prov_uom.toUpperCase();
      if (prov_uom === "G") prov_uom = "GR";
      if (prov_uom === "MLL") prov_uom = "ML";
      if (!["UN","GR","MG","ML"].includes(prov_uom)) {
        return NextResponse.json({ error: `prov_uom inválido: ${prov_uom}` }, { status: 400 });
      }
    }

    const sets: string[] = [];
    const params: any[] = [];

    function addSet(col: string, val: any) {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    }

    if (prov_uom) addSet("prov_uom", prov_uom);
    if (body?.prov_presentacion != null) addSet("prov_presentacion", Number(body.prov_presentacion));
    if (body?.presentacion != null) addSet("prov_presentacion", Number(body.presentacion));
    if (body?.prov_costo != null) addSet("prov_costo", Number(body.prov_costo));
    if (body?.costo != null) addSet("prov_costo", Number(body.costo));
    if (typeof body?.prov_url === "string") addSet("prov_url", body.prov_url);
    if (typeof body?.prov_descripcion === "string") addSet("prov_descripcion", body.prov_descripcion);
    if (body?.prov_act) addSet("prov_act", body.prov_act); // as DATE (string yyyy-mm-dd)
    if (typeof body?.prov_favoritos === "boolean") addSet("prov_favoritos", body.prov_favoritos);

    if (!sets.length) {
      return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
    }

    // WHERE
    let where = "";
    if (Number.isFinite(prov_id)) {
      params.push(prov_id);
      where = `prov_id = $${params.length}`;
    } else {
      
    }

    const q = `UPDATE app.proveedor SET ${sets.join(", ")} WHERE ${where} RETURNING prov_id, product_id, prov_uom, prov_presentacion, prov_costo, prov_costoun`;
    const rows = await sql(q, params);
    return NextResponse.json({ ok: true, updated: rows?.[0] ?? null });
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
