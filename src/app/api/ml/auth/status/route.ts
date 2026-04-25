import { NextResponse } from "next/server";
import { getActiveMeliAuth } from "@/lib/meli-auth";

export async function GET() {
  try {
    const row = await getActiveMeliAuth();
    return NextResponse.json({
      ok: true,
      connected: !!row,
      auth: row
        ? {
            meli_auth_id: row.meli_auth_id,
            site_id: row.site_id,
            user_id: row.user_id,
            nickname: row.nickname,
            scope: row.scope,
            expires_at: row.expires_at,
            connected_at: row.connected_at,
            updated_at: row.updated_at,
            is_active: row.is_active,
          }
        : null,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}