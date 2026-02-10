import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

type ParsedKey =
  | { kind: "PROVEEDOR"; item_id: number; item_key: string }
  | { kind: "FORMULADO_PRODUCTO"; producto_id: number; item_key: string }
  | { kind: "MANUAL_COST_OPTION"; cost_option_id: number; item_key: string };

function decodeRepeated(s: string, maxRounds = 3): string {
  let out = String(s ?? "");
  for (let i = 0; i < maxRounds; i++) {
    try {
      const next = decodeURIComponent(out);
      if (next === out) break;
      out = next;
    } catch {
      break;
    }
  }
  return out;
}

function parseItemKey(raw: string): ParsedKey | null {
  const s = decodeRepeated(String(raw ?? "").trim());

  if (/^\d+$/.test(s)) {
    const id = Number(s);
    if (id > 0) return { kind: "PROVEEDOR", item_id: id, item_key: `p:${id}` };
  }

  const mp = s.match(/^p:(\d+)$/i);
  if (mp) return { kind: "PROVEEDOR", item_id: Number(mp[1]), item_key: `p:${mp[1]}` };

  const mf = s.match(/^fprod:(\d+)$/i);
  if (mf) return { kind: "FORMULADO_PRODUCTO", producto_id: Number(mf[1]), item_key: `fprod:${mf[1]}` };

  const mm = s.match(/^mopt:(\d+)$/i);
  if (mm) return { kind: "MANUAL_COST_OPTION", cost_option_id: Number(mm[1]), item_key: `mopt:${mm[1]}` };

  return null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ item_id: string }> }) {
  const { item_id } = await ctx.params;
  const parsed = parseItemKey(item_id);

  if (!parsed) {
    return NextResponse.json(
      { ok: false, error: "invalid_item_key", raw: item_id },
      { status: 400 }
    );
  }

  // ========= PROVEEDOR =========
  if (parsed.kind === "PROVEEDOR") {
    const q = await pool.query(
      `
      select
        as_of_date::text as date,
        presentacion,
        price_ars
      from app.item_price_daily_pres
      where item_id = $1
      order by as_of_date asc, presentacion asc
      `,
      [parsed.item_id]
    );

    if (q.rowCount === 0) {
      return NextResponse.json(
        {
          ok: true,
          item_key: parsed.item_key,
          kind: "PROVEEDOR",
          series: [],
          note: "Sin histórico.",
        },
        { status: 200 }
      );
    }

    const byPres = new Map<number, Array<{ d: string; y: number }>>();

    for (const r of q.rows) {
      if (!byPres.has(r.presentacion)) byPres.set(r.presentacion, []);
      byPres.get(r.presentacion)!.push({ d: r.date, y: Number(r.price_ars) });
    }

    const series = Array.from(byPres.entries()).map(([pres, points]) => ({
      id: `pres:${pres}`,
      label: `${pres}`,
      unit: "ARS",
      points,
    }));

    return NextResponse.json(
      {
        ok: true,
        item_key: parsed.item_key,
        kind: "PROVEEDOR",
        series,
      },
      { status: 200 }
    );
  }

  // ========= FORMULADO =========
  if (parsed.kind === "FORMULADO_PRODUCTO") {
    return NextResponse.json(
      {
        ok: true,
        item_key: parsed.item_key,
        kind: "FORMULADO",
        series: [],
        note: "Sin histórico: los formulados aún no generan price-history diario.",
      },
      { status: 200 }
    );
  }

  // ========= MANUAL =========
  return NextResponse.json(
    {
      ok: true,
      item_key: parsed.item_key,
      kind: "MANUAL",
      series: [],
      note: "Sin histórico: los costos manuales no tienen serie temporal.",
    },
    { status: 200 }
  );
}