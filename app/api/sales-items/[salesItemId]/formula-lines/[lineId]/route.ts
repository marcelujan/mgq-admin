import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function PATCH(
  req: Request,
  { params }: { params: { salesItemId: string; lineId: string } }
) {
  try {
    const salesItemId = Number(params.salesItemId);
    const lineId = Number(params.lineId);
    if (!Number.isFinite(salesItemId) || !Number.isFinite(lineId)) {
      return NextResponse.json({ error: "Invalid ids" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const enable = !!body?.is_enabled;

    const updated = await sql<{ id: number }>`
      UPDATE sales_item_formula_lines
      SET is_enabled = ${enable}
      WHERE id = ${lineId} AND sales_item_id = ${salesItemId}
      RETURNING id
    `;

    if (!updated.length) {
      return NextResponse.json({ error: "Line not found" }, { status: 404 });
    }
    return NextResponse.json({ id: updated[0].id, is_enabled: enable }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
