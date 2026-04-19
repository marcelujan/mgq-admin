import { NextRequest, NextResponse } from "next/server";
import { intParam, listStockOperaciones } from "@/lib/stock-v2";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawTipo = String(searchParams.get("tipo") ?? "").trim().toUpperCase();
    const tipo = rawTipo === "" ? "" : (["INGRESO","VENTA","PRODUCCION","AJUSTE"].includes(rawTipo) ? rawTipo as any : null);
    if (tipo === null) return NextResponse.json({ ok: false, error: "tipo inválido" }, { status: 400 });
    const search = String(searchParams.get("search") ?? "").trim();
    const fromDate = String(searchParams.get("from") ?? "").trim();
    const toDate = String(searchParams.get("to") ?? "").trim();
    const limit = intParam(searchParams.get("limit"), 300, 1, 1000);
    const items = await listStockOperaciones({ tipo, search, fromDate, toDate, limit });
    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
