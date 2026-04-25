import { NextResponse } from "next/server";
import { disconnectMeliAuth } from "@/lib/meli-auth";

export async function POST() {
  try {
    await disconnectMeliAuth();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}