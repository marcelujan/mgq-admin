import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recalcAndInsertSnapshotsForProducto } from "@/lib/ofertaSnapshots";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function boolOrUndef(v: any): boolean | undefined {
  if (v === undefined) return undefined;
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === 0 || v === "0") return false;
  return undefined;
}

async function upsertManualSnapshotToday(sql: any, cost_option_id: number, costo_ars: number, fuente: "USER" | "CRON" | "AUTO" = "USER") {
  await sql.query(
    `
    insert into app.cost_option_snapshot (cost_option_id, as_of_date, costo_ars, fuente, created_at)
    values ($1, current_date, $2, $3::text, now())
    on conflict (cost_option_id, as_of_date)
    do update set
      costo_ars = excluded.costo_ars,
      fuente = excluded.fuente,
      created_at = excluded.created_at
    `,
    [cost_option_id, costo_ars, fuente]
  );
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ cost_option_id: string }> }) {
  try {
    const { cost_option_id } = await ctx.params;
    const id = Number(cost_option_id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: "cost_option_id inválido" }, { status: 400 });
    }

    const sql = db();
    const res: any = await sql.query(
      `
      SELECT
        cost_option_id, tipo,
        item_id, item_presentacion,
        manual_nombre, manual_uom, manual_cantidad, manual_costo_ars,
        bulk_producto_id,
        densidad_g_ml,
        activo,
        updated_at
      FROM app.cost_option
      WHERE cost_option_id = $1
      LIMIT 1
      `,
      [id]
    );

    const rows = normalizeQueryResult(res);
    if (!rows.length) return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });

    return NextResponse.json({ ok: true, cost_option: rows[0] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ cost_option_id: string }> }) {
  try {
    const { cost_option_id: idStr } = await ctx.params;
    const cost_option_id = Number(idStr);
    if (!Number.isFinite(cost_option_id)) {
      return NextResponse.json({ ok: false, error: "cost_option_id inválido" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));

    const densidad_g_ml = body?.densidad_g_ml === undefined ? undefined : numOrNull(body?.densidad_g_ml);
    const activo = boolOrUndef(body?.activo);

    const manual_nombre = body?.manual_nombre === undefined ? undefined : String(body?.manual_nombre ?? "").trim();
    const manual_uom = body?.manual_uom === undefined ? undefined : String(body?.manual_uom ?? "").trim();
    const manual_cantidad = body?.manual_cantidad === undefined ? undefined : numOrNull(body?.manual_cantidad);
    const manual_costo_ars = body?.manual_costo_ars === undefined ? undefined : numOrNull(body?.manual_costo_ars);

    const bulk_producto_id = body?.bulk_producto_id === undefined ? undefined : Number(body?.bulk_producto_id);

    if (manual_uom !== undefined && !["GR", "ML", "UN", ""].includes(manual_uom)) {
      return NextResponse.json({ ok: false, error: "manual_uom inválido" }, { status: 400 });
    }
    if (bulk_producto_id !== undefined && !Number.isFinite(bulk_producto_id)) {
      return NextResponse.json({ ok: false, error: "bulk_producto_id inválido" }, { status: 400 });
    }
    if (densidad_g_ml !== undefined && densidad_g_ml !== null && densidad_g_ml <= 0) {
      return NextResponse.json({ ok: false, error: "densidad_g_ml inválida" }, { status: 400 });
    }
    if (manual_cantidad !== undefined && manual_cantidad !== null && manual_cantidad <= 0) {
      return NextResponse.json({ ok: false, error: "manual_cantidad inválida" }, { status: 400 });
    }
    if (manual_costo_ars !== undefined && manual_costo_ars !== null && manual_costo_ars < 0) {
      return NextResponse.json({ ok: false, error: "manual_costo_ars inválido" }, { status: 400 });
    }

    const sets: string[] = [];
    const values: any[] = [];
    let p = 1;

    if (densidad_g_ml !== undefined) {
      sets.push(`densidad_g_ml=$${p++}`);
      values.push(densidad_g_ml);
    }
    if (activo !== undefined) {
      sets.push(`activo=$${p++}`);
      values.push(activo);
    }
    if (manual_nombre !== undefined) {
      sets.push(`manual_nombre=$${p++}`);
      values.push(manual_nombre || null);
    }
    if (manual_uom !== undefined) {
      sets.push(`manual_uom=$${p++}`);
      values.push(manual_uom || null);
    }
    if (manual_cantidad !== undefined) {
      sets.push(`manual_cantidad=$${p++}`);
      values.push(manual_cantidad);
    }
    if (manual_costo_ars !== undefined) {
      sets.push(`manual_costo_ars=$${p++}`);
      values.push(manual_costo_ars);
    }
    if (bulk_producto_id !== undefined) {
      sets.push(`bulk_producto_id=$${p++}`);
      values.push(bulk_producto_id);
    }

    if (!sets.length) return NextResponse.json({ ok: true });

    values.push(cost_option_id);

    const sql = db();
    const r: any = await sql.query(
      `
      update app.cost_option
      set ${sets.join(", ")}, updated_at=now()
      where cost_option_id=$${p++}
      returning cost_option_id, tipo, manual_costo_ars, activo
      `,
      values
    );

    const rows = normalizeQueryResult(r);
    if (!rows.length) return NextResponse.json({ ok: false, error: "no existe cost_option" }, { status: 404 });

    const row = rows[0];
    const tipo = String(row?.tipo ?? "");
    const costo = row?.manual_costo_ars === null || row?.manual_costo_ars === undefined ? null : Number(row.manual_costo_ars);
    const isActivo = row?.activo === true;

    // ✅ Snapshot inmediato si es MANUAL y tiene costo.
    // (Si lo desactivan, no insertamos snapshot nuevo.)
    if (tipo === "MANUAL_PRESENTACION" && isActivo && costo !== null && Number.isFinite(costo)) {
      await upsertManualSnapshotToday(sql, cost_option_id, costo, "USER");
    }

    // Recalcular snapshots: todos los productos cuya fórmula usa este cost_option
    try {
      const pr: any = await sql.query(
        `
        select distinct producto_id
        from app.formula_linea_v2
        where cost_option_id = $1
        `,
        [cost_option_id]
      );
      const productoIds = normalizeQueryResult(pr)
        .map((x) => Number(x.producto_id))
        .filter((x) => Number.isFinite(x));

      for (const producto_id of productoIds) {
        await recalcAndInsertSnapshotsForProducto({
          producto_id,
          fuente: "COST_OPTION_DENS_PATCH",
          origin: "/api/cost-options/[cost_option_id]",
        });
      }
    } catch {
      // No romper el PATCH si el recálculo falla.
    }

    return NextResponse.json({ ok: true, cost_option_id: Number(row.cost_option_id) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ cost_option_id: string }> }) {
  const sql = db();
  try {
    const { cost_option_id } = await ctx.params;
    const id = Number(cost_option_id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: "invalid_manual_item_id" }, { status: 400 });
    }

    const existingRes: any = await sql.query(
      `
      select cost_option_id, tipo
      from app.cost_option
      where cost_option_id = $1
      limit 1
      `,
      [id]
    );
    const existingRows = normalizeQueryResult(existingRes);
    const existing = existingRows[0] ?? null;
    if (!existing || String(existing.tipo ?? "") !== "MANUAL_PRESENTACION") {
      return NextResponse.json(
        { ok: false, error: "manual_item_not_found", details: { cost_option_id: id } },
        { status: 404 }
      );
    }

    const depRes: any = await sql.query(
      `
      select
        (select count(*)::int from app.producto_formula_linea_v2 where cost_option_id = $1) as formula_lineas_v2_count,
        (select count(*)::int from app.cost_option_snapshot where cost_option_id = $1) as snapshot_count
      `,
      [id]
    );
    const depRows = normalizeQueryResult(depRes);
    const deps = depRows[0] ?? {};
    const formulaLineasV2Count = Number(deps?.formula_lineas_v2_count ?? 0);
    const snapshotCount = Number(deps?.snapshot_count ?? 0);

    if (formulaLineasV2Count > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "manual_item_in_use",
          details: {
            cost_option_id: id,
            formula_lineas_v2_count: formulaLineasV2Count,
            snapshot_count: snapshotCount,
          },
        },
        { status: 409 }
      );
    }

    await sql.query("begin");
    const rSnap: any = await sql.query(
      `delete from app.cost_option_snapshot where cost_option_id = $1 returning 1`,
      [id]
    );
    const rManual: any = await sql.query(
      `delete from app.cost_option where cost_option_id = $1 and tipo = 'MANUAL_PRESENTACION' returning cost_option_id`,
      [id]
    );

    const deletedRows = normalizeQueryResult(rManual);
    if (!deletedRows.length) {
      await sql.query("rollback");
      return NextResponse.json(
        { ok: false, error: "manual_item_not_found", details: { cost_option_id: id } },
        { status: 404 }
      );
    }

    await sql.query("commit");

    return NextResponse.json({
      ok: true,
      kind: "MANUAL",
      deleted: {
        cost_option: deletedRows.length,
        cost_option_snapshot: normalizeQueryResult(rSnap).length,
      },
    });
  } catch (e: any) {
    try {
      await sql.query("rollback");
    } catch {}
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
