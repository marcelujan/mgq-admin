import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ insumo_id: string }> }) {
  try {
    const { insumo_id: insumo_idStr } = await ctx.params;

    const sql = db();
    const insumo_id = Number(insumo_idStr);
    if (!Number.isFinite(insumo_id)) return NextResponse.json({ ok: false, error: "insumo_id inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));
    const tipo = typeof body?.tipo === "string" ? body.tipo.trim().toUpperCase() : "";

    if (!["MANUAL", "ITEM"].includes(tipo)) {
      return NextResponse.json({ ok: false, error: "tipo inválido (MANUAL|ITEM)" }, { status: 422 });
    }

    const habilitada = body?.habilitada === false ? false : true;
    const prioridad = Number.isFinite(Number(body?.prioridad)) ? Number(body.prioridad) : 100;

    if (tipo === "MANUAL") {
      const costo = Number(body?.costo_por_uom_ars);
      const vigente_desde = typeof body?.vigente_desde === "string" ? body.vigente_desde : null;
      if (!Number.isFinite(costo) || costo < 0) {
        return NextResponse.json({ ok: false, error: "costo_por_uom_ars inválido" }, { status: 422 });
      }

      const r: any = await sql.query(
        `INSERT INTO app.insumo_fuente (insumo_id, tipo, costo_por_uom_ars, vigente_desde, habilitada, prioridad)
         VALUES ($1,'MANUAL',$2,$3,$4,$5)
         RETURNING fuente_id`,
        [insumo_id, costo, vigente_desde, habilitada, prioridad]
      );
      const fuente_id = (Array.isArray(r?.rows) ? r.rows : r)?.[0]?.fuente_id;
      return NextResponse.json({ ok: true, fuente_id }, { status: 201 });
    }

    // ITEM (preferida obligatoria)
    const item_id = Number(body?.item_id);
    const pref = Number(body?.presentacion_preferida);

    if (!Number.isFinite(item_id) || item_id <= 0) {
      return NextResponse.json({ ok: false, error: "item_id inválido" }, { status: 422 });
    }
    if (!Number.isFinite(pref) || pref <= 0) {
      return NextResponse.json({ ok: false, error: "presentacion_preferida requerida (>0)" }, { status: 422 });
    }

    const r: any = await sql.query(
      `INSERT INTO app.insumo_fuente (insumo_id, tipo, item_id, presentacion_preferida, habilitada, prioridad)
       VALUES ($1,'ITEM',$2,$3,$4,$5)
       RETURNING fuente_id`,
      [insumo_id, item_id, pref, habilitada, prioridad]
    );
    const fuente_id = (Array.isArray(r?.rows) ? r.rows : r)?.[0]?.fuente_id;
    return NextResponse.json({ ok: true, fuente_id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
