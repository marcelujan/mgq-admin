export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "../../../../../lib/db"; // ¡relativo!

const PatchSchema = z.object({
  vend_pres: z.number().positive().optional(),
  vend_uom_id: z.number().int().optional(),
  dens_g_ml_override: z.number().positive().nullable().optional(),
  vend_lote: z.string().nullable().optional(),
  vend_vence: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  vend_grado: z.string().nullable().optional(),
  vend_origen: z.string().nullable().optional(),
  vend_obs: z.string().nullable().optional(),
  vend_url: z.string().url().nullable().optional(),
  is_enabled: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const data = PatchSchema.parse(await req.json());
  const updates: Promise<any>[] = [];

  if (data.vend_pres !== undefined)
    updates.push(sql`UPDATE app.sales_items SET vend_pres=${data.vend_pres}, updated_at=now() WHERE id=${id}`);
  if (data.vend_uom_id !== undefined)
    updates.push(sql`UPDATE app.sales_items SET vend_uom_id=${data.vend_uom_id}, updated_at=now() WHERE id=${id}`);
  if (data.dens_g_ml_override !== undefined)
    updates.push(sql`UPDATE app.sales_items SET dens_g_ml_override=${data.dens_g_ml_override}, updated_at=now() WHERE id=${id}`);
  if (data.vend_lote !== undefined)
    updates.push(sql`UPDATE app.sales_items SET vend_lote=${data.vend_lote}, updated_at=now() WHERE id=${id}`);
  if (data.vend_vence !== undefined)
    updates.push(sql`UPDATE app.sales_items SET vend_vence=${data.vend_vence}, updated_at=now() WHERE id=${id}`);
  if (data.vend_grado !== undefined)
    updates.push(sql`UPDATE app.sales_items SET vend_grado=${data.vend_grado}, updated_at=now() WHERE id=${id}`);
  if (data.vend_origen !== undefined)
    updates.push(sql`UPDATE app.sales_items SET vend_origen=${data.vend_origen}, updated_at=now() WHERE id=${id}`);
  if (data.vend_obs !== undefined)
    updates.push(sql`UPDATE app.sales_items SET vend_obs=${data.vend_obs}, updated_at=now() WHERE id=${id}`);
  if (data.vend_url !== undefined)
    updates.push(sql`UPDATE app.sales_items SET vend_url=${data.vend_url}, updated_at=now() WHERE id=${id}`);
  if (data.is_enabled !== undefined)
    updates.push(sql`UPDATE app.sales_items SET is_enabled=${data.is_enabled}, updated_at=now() WHERE id=${id}`);

  if (updates.length === 0)
    return NextResponse.json({ error: "sin cambios" }, { status: 400 });

  await Promise.all(updates);

  const rows = await sql`SELECT * FROM app.v_sales_items_enriched WHERE id=${id}`;
  return NextResponse.json({ item: rows[0] });
}
