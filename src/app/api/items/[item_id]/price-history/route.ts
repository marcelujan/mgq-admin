import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getPriceHistoryForItemFormulado } from "@/lib/itemPriceHistory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeQueryResult(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray((res as any).rows)) return (res as any).rows;
  return [];
}

export async function GET(_req: NextRequest, context: { params: Promise<{ item_id: string }> }) {
  const { item_id } = await context.params;

  const itemId = Number(item_id);
  if (!Number.isFinite(itemId) || itemId <= 0) {
    return NextResponse.json({ error: "invalid_item_id" }, { status: 400 });
  }

  // 1) Si el id corresponde a un item_formulado, devolvemos series unificadas.
  //    (bulk + presentaciones) leyendo snapshots existentes.
  const formulado = await getPriceHistoryForItemFormulado(itemId);
  if (formulado) {
    return NextResponse.json({ ok: true, ...formulado }, { status: 200 });
  }

  // 2) Fallback proveedor (histórico diario por presentación) - compat con UI actual.
  const sql = db();
  const q: any = await sql.query(
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

  const rows = normalizeQueryResult(q);
  return NextResponse.json({ ok: true, item_id: itemId, kind: "PROVEEDOR", rows }, { status: 200 });
}