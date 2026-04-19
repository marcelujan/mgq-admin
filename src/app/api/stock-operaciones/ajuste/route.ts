import { NextRequest, NextResponse } from "next/server";
import { createStockOperacion, ensureTargetExists, insertStockMovimiento, isStockItemTipo, numOrNull, parseFechaOrNull, textOrNull } from "@/lib/stock-v2";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const item_tipo = String(body?.item_tipo ?? "").trim().toUpperCase();
    const item_ref_id = numOrNull(body?.item_ref_id);
    const delta_cantidad = numOrNull(body?.delta_cantidad);
    const fecha = body?.fecha === undefined ? null : parseFechaOrNull(body?.fecha);
    const nota = textOrNull(body?.nota);
    const referencia_externa = textOrNull(body?.referencia_externa);

    if (!isStockItemTipo(item_tipo)) return NextResponse.json({ ok: false, error: "item_tipo inválido" }, { status: 400 });
    if (item_ref_id === null || item_ref_id <= 0) return NextResponse.json({ ok: false, error: "item_ref_id inválido" }, { status: 400 });
    if (delta_cantidad === null || delta_cantidad === 0) return NextResponse.json({ ok: false, error: "delta_cantidad inválida" }, { status: 400 });
    if (!(await ensureTargetExists(item_tipo, item_ref_id))) return NextResponse.json({ ok: false, error: "objetivo no encontrado" }, { status: 404 });

    const op = await createStockOperacion({ tipo: "AJUSTE", fecha, nota, referencia_externa });
    if (!op) throw new Error("No se pudo crear stock_operacion");
    await insertStockMovimiento({ stock_operacion_id: op.stock_operacion_id, item_tipo, item_ref_id, delta_cantidad, nota });
    return NextResponse.json({ ok: true, stock_operacion_id: op.stock_operacion_id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
