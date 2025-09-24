import { NextRequest, NextResponse } from "next/server";

// Endpoint deshabilitado: ya no se usa product_meta ni ref.uoms.
export async function POST(req: NextRequest) {
  try {
    return NextResponse.json({ ok: true, noop: true, note: "update deshabilitado" });
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
