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
    return NextResponse.json({ ok: false, error: "invalid_item_key", raw: item_id }, { status: 400 });
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
        { ok: true, item_key: parsed.item_key, kind: "PROVEEDOR", series: [], note: "Sin histórico." },
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

    return NextResponse.json({ ok: true, item_key: parsed.item_key, kind: "PROVEEDOR", series }, { status: 200 });
  }

  // ========= FORMULADO =========
  if (parsed.kind === "FORMULADO_PRODUCTO") {
    // 1) Resolver item_formulado_id desde producto_id (BULK)
    const idQ = await pool.query(
      `
      select
        f.item_formulado_id::int as item_formulado_id
      from app.item_formulado f
      left join lateral (
        select
          count(*)::int as snapshot_count,
          max(s.as_of_date) as last_snapshot_date
        from app.item_formulado_snapshot s
        where s.item_formulado_id = f.item_formulado_id
      ) snap on true
      where f.producto_id = $1
        and f.tipo = 'BULK'
      order by
        case when f.activo = true then 0 else 1 end asc,
        coalesce(snap.snapshot_count, 0) desc,
        snap.last_snapshot_date desc nulls last,
        f.item_formulado_id asc
      limit 1
      `,
      [parsed.producto_id]
    );

    const itemFormuladoId = idQ.rows[0]?.item_formulado_id as number | undefined;

    if (!itemFormuladoId) {
      return NextResponse.json(
        {
          ok: true,
          item_key: parsed.item_key,
          kind: "FORMULADO",
          series: [],
          note: "Sin histórico (no existe item_formulado BULK para este producto).",
        },
        { status: 200 }
      );
    }

    // 2) Serie diaria desde snapshots por as_of_date (ya hay unique (item_formulado_id, as_of_date))
    const q = await pool.query(
      `
      select
        as_of_date::text as d,
        precio_unitario_ars
      from app.item_formulado_snapshot
      where item_formulado_id = $1
      order by as_of_date asc
      `,
      [itemFormuladoId]
    );

    const points = q.rows
      .map((r) => ({ d: String(r.d), y: Number(r.precio_unitario_ars) }))
      .filter((p) => p.d && Number.isFinite(p.y));

    return NextResponse.json(
      {
        ok: true,
        item_key: parsed.item_key,
        kind: "FORMULADO",
        series: points.length
          ? [{ id: "price", label: "Precio unitario", unit: "ARS", points }]
          : [],
        note: points.length ? undefined : "Sin histórico (sin snapshots).",
      },
      { status: 200 }
    );
  }

  // ========= MANUAL =========
  if (parsed.kind === "MANUAL_COST_OPTION") {
    const q = await pool.query(
      `
      select
        as_of_date::text as d,
        costo_ars
      from app.cost_option_snapshot
      where cost_option_id = $1
      order by as_of_date asc
      `,
      [parsed.cost_option_id]
    );

    const points = q.rows
      .map((r) => ({ d: String(r.d), y: Number(r.costo_ars) }))
      .filter((p) => p.d && Number.isFinite(p.y));

    return NextResponse.json(
      {
        ok: true,
        item_key: parsed.item_key,
        kind: "MANUAL",
        series: points.length ? [{ id: "cost", label: "Costo", unit: "ARS", points }] : [],
        note: points.length ? undefined : "Sin histórico (sin snapshots).",
      },
      { status: 200 }
    );
  }

  // unreachable
  return NextResponse.json({ ok: false, error: "unhandled_kind" }, { status: 500 });
}