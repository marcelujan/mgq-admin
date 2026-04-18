import { NextRequest, NextResponse } from "next/server";
import { getCatalog, patchCatalog, removeCatalog } from "@/lib/vnext-catalogos";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ item_paqueteria_id: string }> }) {
  try {
    const { item_paqueteria_id } = await ctx.params;
    const id = Number(item_paqueteria_id);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ ok: false, error: "item_paqueteria_id inválido" }, { status: 400 });
    const item = await getCatalog("paqueteria", id);
    if (!item) return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, item });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ item_paqueteria_id: string }> }) {
  try {
    const { item_paqueteria_id } = await ctx.params;
    const id = Number(item_paqueteria_id);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ ok: false, error: "item_paqueteria_id inválido" }, { status: 400 });
    const body = await req.json().catch(() => ({} as any));
    const updated = await patchCatalog("paqueteria", id, body);
    if (!updated.ok) return NextResponse.json({ ok: false, error: updated.error }, { status: updated.status ?? 400 });
    return NextResponse.json({ ok: true, item_paqueteria_id: updated.id ?? id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ item_paqueteria_id: string }> }) {
  try {
    const { item_paqueteria_id } = await ctx.params;
    const id = Number(item_paqueteria_id);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ ok: false, error: "item_paqueteria_id inválido" }, { status: 400 });
    const removed = await removeCatalog("paqueteria", id);
    if (!removed.ok) return NextResponse.json({ ok: false, error: removed.error }, { status: removed.status ?? 400 });
    return NextResponse.json({ ok: true, item_paqueteria_id: id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
