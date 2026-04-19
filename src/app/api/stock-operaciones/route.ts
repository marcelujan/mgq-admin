import { NextRequest, NextResponse } from "next/server";
import { intParam, listRecentStockOperaciones } from "@/lib/stock-v2";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = intParam(searchParams.get("limit"), 50, 1, 500);
    const items = await listRecentStockOperaciones(limit);
    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
