import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ item_id: string }> }
) {
  const { item_id } = await context.params;

  const itemId = Number(item_id);
  if (!Number.isFinite(itemId) || itemId <= 0) {
    return NextResponse.json({ error: "invalid_item_id" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    const q = await client.query(
      `
      select
        as_of_date::text as as_of_date,
        presentacion::float8 as presentacion,
        price_ars::float8 as price_ars
      from app.item_price_daily_pres
      where item_id = $1
      order by as_of_date asc, presentacion asc;
      `,
      [itemId]
    );

    return NextResponse.json({ item_id: itemId, rows: q.rows }, { status: 200 });
  } finally {
    client.release();
  }
}
