import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getFormuladoPriceHistory, getProveedorPriceHistory } from "@/lib/itemPriceHistory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ParsedKey =
  | { kind: "PROVEEDOR"; id: number; item_key: string }
  | { kind: "FORMULADO_PERSISTIDO"; id: number; item_key: string }
  | { kind: "FORMULADO_PRODUCTO"; producto_id: number; item_key: string };

function parseItemKey(raw: string): ParsedKey | null {
  const s = String(raw ?? "").trim();

  // legacy: /items/123 => proveedor
  if (/^\d+$/.test(s)) {
    const id = Number(s);
    if (Number.isFinite(id) && id > 0) return { kind: "PROVEEDOR", id, item_key: `p:${id}` };
    return null;
  }

  const mP = s.match(/^p:(\d+)$/i);
  if (mP) {
    const id = Number(mP[1]);
    if (Number.isFinite(id) && id > 0) return { kind: "PROVEEDOR", id, item_key: `p:${id}` };
    return null;
  }

  const mF = s.match(/^f:(\d+)$/i);
  if (mF) {
    const id = Number(mF[1]);
    if (Number.isFinite(id) && id > 0) return { kind: "FORMULADO_PERSISTIDO", id, item_key: `f:${id}` };
    return null;
  }

  const mFP = s.match(/^fprod:(\d+)$/i);
  if (mFP) {
    const producto_id = Number(mFP[1]);
    if (Number.isFinite(producto_id) && producto_id > 0) return { kind: "FORMULADO_PRODUCTO", producto_id, item_key: `fprod:${producto_id}` };
    return null;
  }

  return null;
}

export async function GET(_req: NextRequest, context: { params: Promise<{ item_id: string }> }) {
  const { item_id } = await context.params;

  const parsed = parseItemKey(item_id);
  if (!parsed) return NextResponse.json({ ok: false, error: "invalid_item_key" }, { status: 400 });

  if (parsed.kind === "FORMULADO_PERSISTIDO") {
    const j = await getFormuladoPriceHistory(parsed.id);
    return NextResponse.json({ ok: true, ...j }, { status: 200 });
  }

  if (parsed.kind === "FORMULADO_PRODUCTO") {
    // En esta DB no hay snapshots de formulado. No inventamos historia.
    return NextResponse.json(
      {
        ok: true,
        item_key: parsed.item_key,
        kind: "FORMULADO",
        series: [],
      },
      { status: 200 }
    );
  }

  const j = await getProveedorPriceHistory(parsed.id);
  return NextResponse.json({ ok: true, ...j }, { status: 200 });
}