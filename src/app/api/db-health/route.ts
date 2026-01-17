import { NextResponse } from "next/server";
import { db } from "../../../lib/db";

export async function GET() {
  try {
    const sql = db();
    const rows = await sql`SELECT 1 as ok`;
    const first = (rows as any)?.rows?.[0] ?? (Array.isArray(rows) ? (rows as any)[0] : null);
    return NextResponse.json({ ok: true, db: first?.ok ?? 1 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}