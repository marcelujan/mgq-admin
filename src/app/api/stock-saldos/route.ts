import { NextRequest, NextResponse } from "next/server";
import { intParam, isStockItemTipo, listRecentStockOperaciones, listStockSaldos } from "@/lib/stock-v2";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawTipo = String(searchParams.get("tipo") ?? "").trim().toUpperCase();
    const tipo = rawTipo === "" ? "" : (isStockItemTipo(rawTipo) ? rawTipo : null);
    if (tipo === null) return NextResponse.json({ ok: false, error: "tipo inválido" }, { status: 400 });
    const search = String(searchParams.get("search") ?? "").trim();
    const limit = intParam(searchParams.get("limit"), 400, 1, 5000);
    const rows = await listStockSaldos(tipo, search, limit);
    const recientes = await listRecentStockOperaciones(20);
    return NextResponse.json({ ok: true, rows, recientes });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
