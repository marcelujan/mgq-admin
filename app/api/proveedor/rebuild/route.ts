import { NextRequest, NextResponse } from "next/server";

// Endpoint deshabilitado: los esquemas ops/ref/src fueron eliminados.
// Se deja como no-op para mantener compatibilidad sin alterar datos.
export async function POST(req: NextRequest) {
  try {
    return NextResponse.json({ ok: true, noop: true, note: "rebuild deshabilitado: esquemas antiguos eliminados" });
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
