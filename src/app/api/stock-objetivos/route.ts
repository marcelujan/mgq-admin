import { NextRequest, NextResponse } from "next/server";
import { intParam, isStockItemTipo, listStockObjetivos } from "@/lib/stock-v2";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tipo = String(searchParams.get("tipo") ?? "").trim().toUpperCase();
    const search = String(searchParams.get("search") ?? "").trim();
    const limitDefault = search === "" ? 1000 : 80;
    const limit = intParam(searchParams.get("limit"), limitDefault, 1, 5000);

    if (!isStockItemTipo(tipo)) {
      return NextResponse.json({ ok: false, error: "tipo inválido" }, { status: 400 });
    }

    const items = await listStockObjetivos(tipo, search, limit);
    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
