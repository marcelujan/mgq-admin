import { NextRequest, NextResponse } from "next/server";
import { getCatalog, patchCatalog, removeCatalog } from "@/lib/vnext-catalogos";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ item_etiqueta_id: string }> }) {
  try {
    const { item_etiqueta_id } = await ctx.params;
    const id = Number(item_etiqueta_id);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ ok: false, error: "item_etiqueta_id inválido" }, { status: 400 });
    const item = await getCatalog("etiqueta", id);
    if (!item) return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, item });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ item_etiqueta_id: string }> }) {
  try {
    const { item_etiqueta_id } = await ctx.params;
    const id = Number(item_etiqueta_id);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ ok: false, error: "item_etiqueta_id inválido" }, { status: 400 });
    const body = await req.json().catch(() => ({} as any));
    const updated = await patchCatalog("etiqueta", id, body);
    if (!updated.ok) return NextResponse.json({ ok: false, error: updated.error }, { status: updated.status ?? 400 });
    return NextResponse.json({ ok: true, item_etiqueta_id: updated.id ?? id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ item_etiqueta_id: string }> }) {
  try {
    const { item_etiqueta_id } = await ctx.params;
    const id = Number(item_etiqueta_id);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ ok: false, error: "item_etiqueta_id inválido" }, { status: 400 });
    const removed = await removeCatalog("etiqueta", id);
    if (!removed.ok) return NextResponse.json({ ok: false, error: removed.error }, { status: removed.status ?? 400 });
    return NextResponse.json({ ok: true, item_etiqueta_id: id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
