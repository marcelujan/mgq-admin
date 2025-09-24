import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export async function POST(req: NextRequest) {
  try {
    const DB = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    if (!DB) return NextResponse.json({ error: "Falta DATABASE_URL" }, { status: 500 });
    const sql = neon(DB);

    const body = await req.json();
    const { pp_id, product_id, uom, gml } = body as { pp_id?: number; product_id?: number; uom?: string; gml?: number };

    if (!pp_id && !product_id) {
      return NextResponse.json({ error: "Falta pp_id o product_id" }, { status: 400 });
    }

    const results: any = {};

    if (typeof uom === "string") {
      // map UI values -> ref.uoms
      const code = uom === "GR" ? "g" : uom === "ML" ? "mL" : "UN";
      const upd = await sql(
        `UPDATE app.product_presentations
         SET prov_uom_id = (SELECT id FROM ref.uoms WHERE codigo = $1),
             chosen_uom = $1
         WHERE id = $2
         RETURNING id`,
        [code, pp_id]
      );
      results.uom_updated = upd.length;
    }

    if (typeof gml === "number" && product_id) {
      await sql(`CREATE TABLE IF NOT EXISTS app.product_meta (
        product_id bigint primary key,
        g_per_ml numeric(10,2) not null default 1.00
      );`);
      const upsert = await sql(
        `INSERT INTO app.product_meta (product_id, g_per_ml)
         VALUES ($1, $2)
         ON CONFLICT (product_id) DO UPDATE SET g_per_ml = EXCLUDED.g_per_ml
         RETURNING product_id`,
        [product_id, gml]
      );
      results.gml_updated = upsert.length;
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}