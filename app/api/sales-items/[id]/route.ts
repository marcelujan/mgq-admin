import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const PatchSchema = z.object({
  vend_pres: z.number().positive().optional(),
  vend_uom_id: z.number().int().optional(),
  dens_g_ml_override: z.number().positive().optional().nullable(),
  vend_lote: z.string().optional().nullable(),
  vend_vence: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  vend_grado: z.string().optional().nullable(),
  vend_origen: z.string().optional().nullable(),
  vend_obs: z.string().optional().nullable(),
  vend_url: z.string().url().optional().nullable(),
  is_enabled: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = Number(params.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 });
    }

    const body = await req.json();
    const data = PatchSchema.parse(body);

    // build SET dinámico
    const fields: string[] = [];
    const values: any[] = [];

    const push = (col: string, val: any) => {
      values.push(val);
      fields.push(`${col} = $${values.length}`);
    };

    if (data.vend_pres !== undefined) push("vend_pres", data.vend_pres);
    if (data.vend_uom_id !== undefined) push("vend_uom_id", data.vend_uom_id);
    if (data.dens_g_ml_override !== undefined) push("dens_g_ml_override", data.dens_g_ml_override);
    if (data.vend_lote !== undefined) push("vend_lote", data.vend_lote);
    if (data.vend_vence !== undefined) push("vend_vence", data.vend_vence);
    if (data.vend_grado !== undefined) push("vend_grado", data.vend_grado);
    if (data.vend_origen !== undefined) push("vend_origen", data.vend_origen);
    if (data.vend_obs !== undefined) push("vend_obs", data.vend_obs);
    if (data.vend_url !== undefined) push("vend_url", data.vend_url);
    if (data.is_enabled !== undefined) push("is_enabled", data.is_enabled);

    if (fields.length === 0) {
      return NextResponse.json({ error: "sin cambios" }, { status: 400 });
    }

    push("updated_at", new Date().toISOString());

    const sql = `UPDATE app.sales_items SET ${fields.join(", ")} WHERE id = $$${
      values.length + 1
    } RETURNING id;`;

    const { rows } = await query(sql.replace("$$", "$"), [...values, id]);
    if (rows.length === 0) return NextResponse.json({ error: "no encontrado" }, { status: 404 });

    // devolver fila enriquecida desde la vista (reactiva)
    const { rows: enriched } = await query(
      `SELECT * FROM app.v_sales_items_enriched WHERE id = $1`,
      [id]
    );

    return NextResponse.json({ item: enriched[0] });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message ?? "unexpected" }, { status: 500 });
  }
}
