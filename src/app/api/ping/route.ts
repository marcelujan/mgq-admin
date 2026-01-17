import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({ has_neon: !!process.env.NEON_DATABASE_URL });
}
