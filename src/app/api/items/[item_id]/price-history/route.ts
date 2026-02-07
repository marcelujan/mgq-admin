import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getFormuladoPriceHistory, getProveedorPriceHistory } from "@/lib/itemPriceHistory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseItemKey(raw: string): { kind: "PROVEEDOR" | "FORMULADO"; id: number } | null {
  const s = String(raw ?? "").trim();

  // soporte legacy: /items/123
  if (/^\d+$/.test(s)) {
    const id = Number(s);
    if (Number.isFinite(id) && id > 0) return { kind: "PROVEEDOR", id };
    return null;
  }

  const m = s.match(/^([pf]):(\d+)$/i);
  if (!m) return null;

  const id = Number(m[2]);
  if (!Number.isFinite(id) || id <= 0) return null;

  if (m[1].toLowerCase() === "p") return { kind: "PROVEEDOR", id };
  return { kind: "FORMULADO", id };
}

export async function GET(_req: NextRequest, context: { params: Promise<{ item_id: string }> }) {
  const { item_id } = await context.params;

  const parsed = parseItemKey(item_id);
  if (!parsed) return NextResponse.json({ ok: false, error: "invalid_item_key" }, { status: 400 });

  if (parsed.kind === "FORMULADO") {
    const j = await getFormuladoPriceHistory(parsed.id);
    return NextResponse.json({ ok: true, ...j }, { status: 200 });
  }

  const j = await getProveedorPriceHistory(parsed.id);
  return NextResponse.json({ ok: true, ...j }, { status: 200 });
}