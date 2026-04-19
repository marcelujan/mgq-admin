import { NextRequest, NextResponse } from "next/server";
import { clearStockMovimientos, ensureTargetExists, getStockOperacionDetail, insertStockMovimiento, isStockItemTipo, numOrNull, parseFechaOrNull, textOrNull, updateStockOperacionMeta } from "@/lib/stock-v2";

type Ctx = { params: Promise<{ stock_operacion_id: string }> };
type ConsumoLine = { item_tipo?: string; item_ref_id?: number | string; cantidad?: number | string };

export async function GET(_: NextRequest, ctx: Ctx) {
  try {
    const { stock_operacion_id: stockOperacionIdStr } = await ctx.params;
    const stock_operacion_id = Number(stockOperacionIdStr);
    if (!Number.isFinite(stock_operacion_id) || stock_operacion_id <= 0) {
      return NextResponse.json({ ok: false, error: "stock_operacion_id inválido" }, { status: 400 });
    }
    const operacion = await getStockOperacionDetail(stock_operacion_id);
    if (!operacion) return NextResponse.json({ ok: false, error: "operación no encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true, operacion });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { stock_operacion_id: stockOperacionIdStr } = await ctx.params;
    const stock_operacion_id = Number(stockOperacionIdStr);
    if (!Number.isFinite(stock_operacion_id) || stock_operacion_id <= 0) {
      return NextResponse.json({ ok: false, error: "stock_operacion_id inválido" }, { status: 400 });
    }

    const current = await getStockOperacionDetail(stock_operacion_id);
    if (!current) return NextResponse.json({ ok: false, error: "operación no encontrada" }, { status: 404 });

    const body = await req.json().catch(() => ({} as any));
    const tipo = String(body?.tipo ?? current.tipo).trim().toUpperCase();
    const fecha = body?.fecha === undefined ? current.fecha : parseFechaOrNull(body?.fecha);
    const nota = textOrNull(body?.nota);
    const referencia_externa = textOrNull(body?.referencia_externa);

    if (!["INGRESO", "AJUSTE", "PRODUCCION", "VENTA"].includes(tipo)) {
      return NextResponse.json({ ok: false, error: "tipo inválido" }, { status: 400 });
    }

    if (tipo === "INGRESO" || tipo === "AJUSTE") {
      const item_tipo = String(body?.item_tipo ?? "").trim().toUpperCase();
      const item_ref_id = numOrNull(body?.item_ref_id);
      const qtyRaw = tipo === "INGRESO" ? body?.cantidad : body?.delta_cantidad;
      const amount = numOrNull(qtyRaw);
      if (!isStockItemTipo(item_tipo)) return NextResponse.json({ ok: false, error: "item_tipo inválido" }, { status: 400 });
      if (item_ref_id === null || item_ref_id <= 0) return NextResponse.json({ ok: false, error: "item_ref_id inválido" }, { status: 400 });
      if (amount === null || amount === 0 || (tipo === "INGRESO" && amount <= 0)) return NextResponse.json({ ok: false, error: "cantidad inválida" }, { status: 400 });
      if (!(await ensureTargetExists(item_tipo, item_ref_id))) return NextResponse.json({ ok: false, error: "objetivo no encontrado" }, { status: 404 });

      await updateStockOperacionMeta(stock_operacion_id, { tipo: tipo as any, fecha, nota, referencia_externa });
      await clearStockMovimientos(stock_operacion_id);
      await insertStockMovimiento({
        stock_operacion_id,
        item_tipo,
        item_ref_id,
        delta_cantidad: tipo === "INGRESO" ? Math.abs(amount) : amount,
        nota,
      });
      return NextResponse.json({ ok: true, stock_operacion_id });
    }

    if (tipo === "PRODUCCION") {
      const formulado_item_formulado_id = numOrNull(body?.formulado_item_formulado_id);
      const cantidad_obtenida = numOrNull(body?.cantidad_obtenida);
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
        .map((x) => ({ item_tipo: String(x?.item_tipo ?? "").trim().toUpperCase(), item_ref_id: numOrNull(x?.item_ref_id), cantidad: numOrNull(x?.cantidad) }))
        .filter((x) => x.item_ref_id !== null && x.cantidad !== null && x.cantidad > 0);
      if (cleanConsumos.length === 0) return NextResponse.json({ ok: false, error: "Debe informar al menos 1 consumo" }, { status: 400 });
      for (const c of cleanConsumos) {
        if (!isStockItemTipo(c.item_tipo) || ["ENVASE", "ETIQUETA", "PAQUETERIA"].includes(c.item_tipo)) {
          return NextResponse.json({ ok: false, error: "Los consumos de producción deben ser MANUAL, PROVEEDOR o FORMULADO" }, { status: 400 });
        }
        if (!(await ensureTargetExists(c.item_tipo as any, Number(c.item_ref_id)))) {
          return NextResponse.json({ ok: false, error: `Consumo no encontrado: ${c.item_tipo} #${c.item_ref_id}` }, { status: 404 });
        }
      }

      await updateStockOperacionMeta(stock_operacion_id, { tipo: "PRODUCCION", fecha, nota, referencia_externa });
      await clearStockMovimientos(stock_operacion_id);
      for (const c of cleanConsumos) {
        await insertStockMovimiento({ stock_operacion_id, item_tipo: c.item_tipo as any, item_ref_id: Number(c.item_ref_id), delta_cantidad: -Math.abs(Number(c.cantidad)), nota });
      }
      await insertStockMovimiento({ stock_operacion_id, item_tipo: "FORMULADO", item_ref_id: formulado_item_formulado_id, delta_cantidad: Math.abs(cantidad_obtenida), nota });
      return NextResponse.json({ ok: true, stock_operacion_id });
    }

    return NextResponse.json({ ok: false, error: "tipo no soportado en esta edición" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
