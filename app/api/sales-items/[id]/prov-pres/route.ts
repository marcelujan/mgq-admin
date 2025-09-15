export const runtime = "nodejs";
import { z } from "zod";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db"; 

const ChangeProvSchema = z.object({
  supplier_presentation_id: z.number().int(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const { supplier_presentation_id } = ChangeProvSchema.parse(await req.json());

  // UPDATE
  const updated = await sql`
    UPDATE app.sales_items
    SET prov_supplier_presentation_id = ${supplier_presentation_id},
        updated_at = now()
    WHERE id = ${id}
    RETURNING id
  `;
  if (updated.length === 0) {
    return NextResponse.json({ error: "no encontrado" }, { status: 404 });
  }

  // SELECT enriquecido
  const rows = await sql`
    SELECT * FROM app.v_sales_items_enriched WHERE id = ${id}
  `;
  return NextResponse.json({ item: rows[0] });
}
