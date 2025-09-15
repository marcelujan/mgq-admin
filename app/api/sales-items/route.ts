export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  // Probar que responde (luego cambiamos por el SELECT real)
  const { rows } = await query("SELECT 1 AS ok");
  return NextResponse.json({ ok: true, ping: rows[0].ok });
}
