import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function PATCH(
  _req: Request,
  { params }: { params: { presentationId: string } }
) {
  try {
    const presId = Number(params.presentationId);
    if (!Number.isFinite(presId)) {
      return NextResponse.json({ error: "Invalid presentationId" }, { status: 400 });
    }
    const body = await _req.json().catch(() => ({}));
    const enable = !!body?.is_enabled;

    const updated = await sql<{ id: number }>`
      UPDATE sales_items
      SET is_enabled = ${enable}
      WHERE product_presentation_id = ${presId}
      RETURNING id
    `;

    return NextResponse.json(
      { count: updated.length, updatedIds: updated.map(r => r.id) },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
