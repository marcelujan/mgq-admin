import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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
    if (!Number.isFinite(insumo_id)) {
      return NextResponse.json({ ok: false, error: "insumo_id inválido" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));
    const tipo = typeof body?.tipo === "string" ? body.tipo.trim().toUpperCase() : "";

    if (!["MANUAL", "ITEM", "OFERTA_BULK"].includes(tipo)) {
      return NextResponse.json({ ok: false, error: "tipo inválido (MANUAL|ITEM|OFERTA_BULK)" }, { status: 422 });
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

    if (tipo === "ITEM") {
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
    }

    // OFERTA_BULK: costo proviene del costeo de una oferta BULK de otro producto (sin extras/merma)
    const oferta_id = Number(body?.oferta_id);
    if (!Number.isFinite(oferta_id) || oferta_id <= 0) {
      return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 422 });
    }

    // Validaciones: insumo debe ser GR (fórmula en % p/p) y oferta debe ser BULK
    const insRes: any = await sql.query(`SELECT insumo_id, tipo_uom FROM app.insumo WHERE insumo_id=$1 LIMIT 1`, [insumo_id]);
    const ins = normalizeQueryResult(insRes)?.[0];
    if (!ins) return NextResponse.json({ ok: false, error: "insumo no encontrado" }, { status: 404 });
    if (String(ins.tipo_uom).toUpperCase() !== "GR") {
      return NextResponse.json(
        { ok: false, error: "Para OFERTA_BULK, el insumo debe ser tipo_uom=GR (la fórmula está en % p/p)." },
        { status: 422 }
      );
    }

    const offRes: any = await sql.query(`SELECT oferta_id, is_bulk FROM app.producto_oferta WHERE oferta_id=$1 LIMIT 1`, [oferta_id]);
    const off = normalizeQueryResult(offRes)?.[0];
    if (!off) return NextResponse.json({ ok: false, error: "oferta no encontrada" }, { status: 404 });
    if (off.is_bulk !== true) {
      return NextResponse.json({ ok: false, error: "La oferta_id indicada no es BULK (is_bulk=false)." }, { status: 422 });
    }

    const r: any = await sql.query(
      `INSERT INTO app.insumo_fuente (insumo_id, tipo, oferta_id, habilitada, prioridad)
       VALUES ($1,'OFERTA_BULK',$2,$3,$4)
       RETURNING fuente_id`,
      [insumo_id, oferta_id, habilitada, prioridad]
    );
    const fuente_id = (Array.isArray(r?.rows) ? r.rows : r)?.[0]?.fuente_id;
    return NextResponse.json({ ok: true, fuente_id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
