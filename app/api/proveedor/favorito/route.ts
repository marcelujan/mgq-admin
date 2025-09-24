import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export async function POST(req: NextRequest) {
  try {
    const DB = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    if (!DB) return NextResponse.json({ error: "Falta DATABASE_URL" }, { status: 500 });
    const sql = neon(DB);

    const body = await req.json();
    const id = Number(body?.id);
    const value = Boolean(body?.value);

    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 });
    }

    await sql(`UPDATE app.proveedor SET prov_favoritos = $1 WHERE id = $2`, [value, id]);
    return NextResponse.json({ ok: true });
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}