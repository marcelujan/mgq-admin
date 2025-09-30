import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export async function POST(req: NextRequest) {
  try {
    const DB = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    if (!DB) return NextResponse.json({ error: "Falta DATABASE_URL" }, { status: 500 });
    const sql = neon(DB);

    const body = await req.json();
    const prov_id = Number(body?.prov_id);

    if (!prov_id) return NextResponse.json({ error: "prov_id requerido" }, { status: 400 });

    if (prov_id) {
      await sql(`DELETE FROM app.proveedor WHERE prov_id = $1`, [prov_id]);
      return NextResponse.json({ ok: true, prov_id });
}