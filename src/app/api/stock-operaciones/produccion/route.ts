import { NextRequest, NextResponse } from "next/server";
import { createStockOperacion, ensureTargetExists, insertStockMovimiento, isStockItemTipo, numOrNull, parseFechaOrNull, textOrNull } from "@/lib/stock-v2";

type ConsumoLine = { item_tipo?: string; item_ref_id?: number | string; cantidad?: number | string };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const formulado_item_formulado_id = numOrNull(body?.formulado_item_formulado_id);
    const cantidad_obtenida = numOrNull(body?.cantidad_obtenida);
    const fecha = body?.fecha === undefined ? null : parseFechaOrNull(body?.fecha);
    const nota = textOrNull(body?.nota);
    const referencia_externa = textOrNull(body?.referencia_externa);
    const consumos = Array.isArray(body?.consumos) ? (body.consumos as ConsumoLine[]) : [];

    if (formulado_item_formulado_id === null || formulado_item_formulado_id <= 0) {
      return NextResponse.json({ ok: false, error: "formulado_item_formulado_id inválido" }, { status: 400 });
    }
    if (cantidad_obtenida === null || cantidad_obtenida <= 0) {
      return NextResponse.json({ ok: false, error: "cantidad_obtenida inválida" }, { status: 400 });
    }
    if (!(await ensureTargetExists("FORMULADO", formulado_item_formulado_id))) {
      return NextResponse.json({ ok: false, error: "formulado no encontrado" }, { status: 404 });
    }

    const cleanConsumos = consumos
      .map((x) => ({
        item_tipo: String(x?.item_tipo ?? "").trim().toUpperCase(),
        item_ref_id: numOrNull(x?.item_ref_id),
        cantidad: numOrNull(x?.cantidad),
      }))
      .filter((x) => x.item_ref_id !== null && x.cantidad !== null && x.cantidad > 0);

    if (cleanConsumos.length === 0) {
      return NextResponse.json({ ok: false, error: "Debe informar al menos 1 consumo" }, { status: 400 });
    }

    for (const c of cleanConsumos) {
      if (!isStockItemTipo(c.item_tipo) || c.item_tipo === "ENVASE" || c.item_tipo === "ETIQUETA" || c.item_tipo === "PAQUETERIA") {
        return NextResponse.json({ ok: false, error: "Los consumos de producción deben ser MANUAL, PROVEEDOR o FORMULADO" }, { status: 400 });
      }
      if (!(await ensureTargetExists(c.item_tipo, Number(c.item_ref_id)))) {
        return NextResponse.json({ ok: false, error: `Consumo no encontrado: ${c.item_tipo} #${c.item_ref_id}` }, { status: 404 });
      }
    }

    const op = await createStockOperacion({ tipo: "PRODUCCION", fecha, nota, referencia_externa });
    if (!op) throw new Error("No se pudo crear stock_operacion");

    for (const c of cleanConsumos) {
      await insertStockMovimiento({
        stock_operacion_id: op.stock_operacion_id,
        item_tipo: c.item_tipo as any,
        item_ref_id: Number(c.item_ref_id),
        delta_cantidad: -Math.abs(Number(c.cantidad)),
        nota,
      });
    }

    await insertStockMovimiento({
      stock_operacion_id: op.stock_operacion_id,
      item_tipo: "FORMULADO",
      item_ref_id: formulado_item_formulado_id,
      delta_cantidad: cantidad_obtenida,
      nota,
    });

    return NextResponse.json({ ok: true, stock_operacion_id: op.stock_operacion_id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
