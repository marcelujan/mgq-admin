import { NextRequest, NextResponse } from "next/server";
import { createCatalog, listCatalog } from "@/lib/vnext-catalogos";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") ?? "").trim();
    const items = await listCatalog("etiqueta", search);
    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const created = await createCatalog("etiqueta", body);
    if (!created.ok) return NextResponse.json({ ok: false, error: created.error }, { status: 400 });
    return NextResponse.json({ ok: true, item_etiqueta_id: created.id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
