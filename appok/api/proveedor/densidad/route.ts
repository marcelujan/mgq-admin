import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export async function POST(req: NextRequest) {
  try {
    const DB = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    if (!DB) return NextResponse.json({ error: "Falta DATABASE_URL" }, { status: 500 });
    const sql = neon(DB);

    const body = await req.json();
    const prov_id = Number(body?.prov_id ?? body?._prov_id ?? body?.id ?? body?._id);
    const densidad = Number(body?.densidad);

    if (!Number.isFinite(prov_id)) {
      return NextResponse.json({ error: "prov_id inválido" }, { status: 400 });
    }
    if (!Number.isFinite(densidad) || densidad <= 0 || densidad > 20) {
      return NextResponse.json({ error: "densidad inválida (0 < d ≤ 20)" }, { status: 400 });
    }

    await sql(`UPDATE app.proveedor SET prov_densidad = $1 WHERE prov_id = $2`, [densidad, prov_id]);
    return NextResponse.json({ ok: true });
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}