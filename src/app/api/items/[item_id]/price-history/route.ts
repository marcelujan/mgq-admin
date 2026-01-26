import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";

function toInt(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ item_id: string }> }
) {
  const sql = db();

  const { item_id } = await context.params;
  const itemId = toInt(item_id);
  if (!itemId) return NextResponse.json({ error: "invalid_item_id" }, { status: 400 });

  const url = new URL(req.url);
  const days = toInt(url.searchParams.get("days")) ?? 30;

  const rows = (await sql`
    select
      as_of_date::text as date,
      presentacion::float8 as presentacion,
      price_ars::float8 as price_ars
    from app.item_price_daily_pres
    where item_id = ${itemId}
      and as_of_date >= current_date - (${days}::int)
    order by as_of_date asc, presentacion asc;
  `) as any[];

  return NextResponse.json({ item_id: itemId, days, rows }, { status: 200 });
}
