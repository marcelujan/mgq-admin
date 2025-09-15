export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { query } from "../../../lib/db"; // <- OJO: relativo desde app/api/sales-items/

export async function GET() {
  const { rows } = await query("SELECT 1 AS ok");
  return NextResponse.json({ ok: rows[0].ok });
}
