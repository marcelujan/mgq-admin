import { NextRequest, NextResponse } from "next/server";
import { intParam, listStockFaltantes } from "@/lib/stock-v2";
import type { ComercialEstado } from "@/lib/stock-v2";

function isEstado(v: string): v is ComercialEstado | "CON_ADVERTENCIAS" {
  return ["BORRADOR", "OFERTABLE", "BLOQUEADO", "CON_ADVERTENCIAS"].includes(v);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = String(searchParams.get("search") ?? "").trim();
    const rawEstado = String(searchParams.get("estado") ?? "").trim().toUpperCase();
    const estado = rawEstado === "" ? "" : (isEstado(rawEstado) ? rawEstado : null);
    if (estado === null) return NextResponse.json({ ok: false, error: "estado inválido" }, { status: 400 });
    const limit = intParam(searchParams.get("limit"), 500, 1, 5000);
    const data = await listStockFaltantes(search, estado, limit);
    return NextResponse.json({ ok: true, ...data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
