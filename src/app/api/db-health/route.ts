import { NextResponse } from "next/server";
import { db } from "../../../lib/db";

export async function GET() {
  try {
    const sql = db();
    const rows = (await sql`SELECT 1 as ok`) as Array<{ ok: number }>;
    return NextResponse.json({ ok: true, db: rows[0]?.ok ?? 1 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}S