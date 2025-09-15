import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const ChangeProvSchema = z.object({
  supplier_presentation_id: z.number().int(),
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

    const { supplier_presentation_id } = ChangeProvSchema.parse(await req.json());

    const sql = `
      UPDATE app.sales_items
      SET prov_supplier_presentation_id = $1, updated_at = now()
      WHERE id = $2
      RETURNING id;
    `;

    const { rows } = await query(sql, [supplier_presentation_id, id]);
    if (rows.length === 0) return NextResponse.json({ error: "no encontrado" }, { status: 404 });

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
