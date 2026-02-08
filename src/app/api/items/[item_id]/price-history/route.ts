import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getProveedorPriceHistory } from "@/lib/itemPriceHistory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ParsedKey =
  | { kind: "PROVEEDOR"; id: number; item_key: string }
  | { kind: "FORMULADO_PRODUCTO"; producto_id: number; item_key: string }
  | { kind: "MANUAL_COST_OPTION"; cost_option_id: number; item_key: string };

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function parseItemKey(raw: string): ParsedKey | null {
  // Next puede entregar params ya decodificado o no; soportamos ambos.
  const s = safeDecode(String(raw ?? "").trim());

  // legacy: /items/123
  if (/^\d+$/.test(s)) {
    const id = Number(s);
    if (Number.isFinite(id) && id > 0) return { kind: "PROVEEDOR", id, item_key: `p:${id}` };
    return null;
  }

  const mp = s.match(/^p:(\d+)$/i);
  if (mp) {
    const id = Number(mp[1]);
    if (Number.isFinite(id) && id > 0) return { kind: "PROVEEDOR", id, item_key: `p:${id}` };
    return null;
  }

  const mfp = s.match(/^fprod:(\d+)$/i);
  if (mfp) {
    const producto_id = Number(mfp[1]);
    if (Number.isFinite(producto_id) && producto_id > 0)
      return { kind: "FORMULADO_PRODUCTO", producto_id, item_key: `fprod:${producto_id}` };
    return null;
  }

  const mm = s.match(/^mopt:(\d+)$/i);
  if (mm) {
    const cost_option_id = Number(mm[1]);
    if (Number.isFinite(cost_option_id) && cost_option_id > 0)
      return { kind: "MANUAL_COST_OPTION", cost_option_id, item_key: `mopt:${cost_option_id}` };
    return null;
  }

  return null;
}

export async function GET(_req: NextRequest, context: { params: Promise<{ item_id: string }> }) {
  const { item_id } = await context.params;

  const parsed = parseItemKey(item_id);
  if (!parsed) return NextResponse.json({ ok: false, error: "invalid_item_key", item_id }, { status: 400 });

  if (parsed.kind === "PROVEEDOR") {
    const j = await getProveedorPriceHistory(parsed.id);
    return NextResponse.json({ ok: true, ...j }, { status: 200 });
  }

  if (parsed.kind === "FORMULADO_PRODUCTO") {
    return NextResponse.json(
      {
        ok: true,
        item_key: parsed.item_key,
        kind: "FORMULADO",
        series: [],
        note:
          "Sin histórico: producto_oferta=0 y producto_oferta_costo_snapshot=0 en este entorno. Se mostrará historial cuando existan snapshots.",
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      item_key: parsed.item_key,
      kind: "MANUAL",
      series: [],
      note: "Sin histórico: no hay tabla de price-history para cost_option en este schema.",
    },
    { status: 200 }
  );
}