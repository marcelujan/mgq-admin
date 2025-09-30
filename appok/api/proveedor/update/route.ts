import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

/**
 * Actualiza columnas de app.proveedor por prov_id.
 * Acepta JSON o form-data. Campos soportados:
 *   prov_presentacion, prov_uom, prov_costo, prov_costoun,
 *   prov_url, prov_descripcion, prov_act, prov_favoritos, prov_proveedor
 */
export async function POST(req: NextRequest) {
  try {
    const DB = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    if (!DB) return NextResponse.json({ error: "Falta DATABASE_URL" }, { status: 500 });
    const sql = neon(DB);

    let body: any = null;
    try { body = await req.json(); } catch {}

    let form: FormData | null = null;
    try { form = await req.formData(); } catch {}

    const getVal = (k: string): any => {
      const vb = body && typeof body === "object" ? body[k] : undefined;
      const vf = form ? form.get(k) : undefined;
      return vb !== undefined ? vb : vf;
    };

    const prov_id = Number(getVal("prov_id"));
    if (!Number.isFinite(prov_id)) {
      return NextResponse.json({ error: "prov_id requerido" }, { status: 400 });
    }

    const sets: string[] = [];
    const params: any[] = [];
    const add = (col: string, val: any) => { sets.push(`${col} = $${params.length + 1}`); params.push(val); };

    // Normalización y agregados
    const maybeNum = (v: any) => (v === null || v === "" || typeof v === "undefined") ? null : Number(v) || null;

    const pres = getVal("prov_presentacion");
    if (pres !== undefined) add("prov_presentacion", maybeNum(pres));

    const uom = getVal("prov_uom");
    if (typeof uom === "string") add("prov_uom", uom);

    const costo = getVal("prov_costo");
    if (costo !== undefined) add("prov_costo", maybeNum(costo));

    const costoun = getVal("prov_costoun");
    if (costoun !== undefined) add("prov_costoun", maybeNum(costoun));

    const url = getVal("prov_url");
    if (typeof url === "string") add("prov_url", url);

    const desc = getVal("prov_descripcion");
    if (typeof desc === "string") add("prov_descripcion", desc);

    const act = getVal("prov_act");
    if (typeof act === "string") add("prov_act", act);

    const fav = getVal("prov_favoritos");
    if (fav !== undefined) {
      const b = (fav === "on" || fav === "true" || fav === "1" || fav === true);
      add("prov_favoritos", b);
    }

    const provprov = getVal("prov_proveedor");
    if (typeof provprov === "string") add("prov_proveedor", provprov);

    if (sets.length === 0) {
      return NextResponse.json({ ok: true, updated: null });
    }

    params.push(prov_id);
    const q = `UPDATE app.proveedor SET ${sets.join(", ")} WHERE prov_id = $${params.length} RETURNING prov_id, prov_uom, prov_presentacion, prov_costo, prov_costoun, prov_proveedor`;
    const rows = await sql(q, params as any);
    return NextResponse.json({ ok: true, updated: rows?.[0] ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}