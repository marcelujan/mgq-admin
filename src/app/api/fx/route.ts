import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { FX_SOURCE_MANUAL } from "@/lib/fx-bna";

function normRows(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function isValidDateKey(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = String(searchParams.get("search") ?? "").trim();
    const limitRaw = Number(searchParams.get("limit") ?? 200);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : 200;
    const sql = db();

    const params: any[] = [];
    let where = "";
    if (search) {
      params.push(`%${search}%`);
      where = `WHERE fecha::text ILIKE $${params.length}`;
    }
    params.push(limit);

    const rows = normRows(
      await sql.query(
        `
        SELECT fecha::text as fecha, valor::float8 as valor, fuente
        FROM app.fx
        ${where}
        ORDER BY fecha DESC
        LIMIT $${params.length}
        `,
        params
      )
    ).map((r) => ({ fecha: String(r.fecha ?? ""), valor: r.valor === null || r.valor === undefined ? null : Number(r.valor), fuente: String(r.fuente ?? "") }));

    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const fecha = String(body?.fecha ?? "").trim();
    const valor = Number(body?.valor);
    if (!isValidDateKey(fecha)) return NextResponse.json({ ok: false, error: "fecha inválida" }, { status: 400 });
    if (!Number.isFinite(valor) || valor <= 0) return NextResponse.json({ ok: false, error: "valor inválido" }, { status: 400 });

    const sql = db();
    let rows = normRows(await sql.query(`UPDATE app.fx SET valor = $2, fuente = $3 WHERE fecha = $1::date RETURNING fecha::text as fecha, valor::float8 as valor, fuente`, [fecha, valor, FX_SOURCE_MANUAL]));
    if (!rows.length) {
      rows = normRows(await sql.query(`INSERT INTO app.fx (fecha, valor, fuente) VALUES ($1::date, $2, $3) RETURNING fecha::text as fecha, valor::float8 as valor, fuente`, [fecha, valor, FX_SOURCE_MANUAL]));
    }
    return NextResponse.json({ ok: true, row: rows[0] ?? null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
