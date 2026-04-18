import { NextRequest, NextResponse } from "next/server";
import { createCatalog, listCatalog } from "@/lib/vnext-catalogos";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") ?? "").trim();
    const items = await listCatalog("envases", search);
    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const created = await createCatalog("envases", body);
    if (!created.ok) return NextResponse.json({ ok: false, error: created.error }, { status: 400 });
    return NextResponse.json({ ok: true, item_envase_id: created.id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
