import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recalcAndInsertSnapshotsForProducto } from "@/lib/ofertaSnapshots";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function requireCronAuth(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return; // si no hay secret, no bloqueamos (modo dev)
  const auth = req.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  if (auth !== expected) {
    const err = new Error("unauthorized");
    // @ts-ignore
    err.status = 401;
    throw err;
  }
}

export async function GET(req: NextRequest) {
  try {
    requireCronAuth(req);

    const sql = db();

    // Productos que tienen fórmula v2 (ajustado a tu naming real)
    const r: any = await sql.query(
      `
      SELECT pf.producto_id
      FROM app.producto_formula_v2 pf
      ORDER BY pf.producto_id ASC
      `
    );

    const rows = normalizeQueryResult(r);
    const productoIds = rows.map((x) => Number(x.producto_id)).filter((n) => Number.isFinite(n));

    let okCount = 0;
    const errors: { producto_id: number; error: string }[] = [];

    for (const producto_id of productoIds) {
      try {
        await recalcAndInsertSnapshotsForProducto({
          producto_id,
          fuente: "CRON_DAILY",
          origin: "cron/recalc-snapshots",
        });
        okCount++;
      } catch (e: any) {
        errors.push({ producto_id, error: e?.message ?? "error" });
      }
    }

    return NextResponse.json({
      ok: true,
      total: productoIds.length,
      processed_ok: okCount,
      processed_error: errors.length,
      errors,
    });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status });
  }
}