import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function normRows(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function isValidDateKey(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export async function GET(_: NextRequest, ctx: { params: Promise<{ fecha: string }> }) {
  try {
    const { fecha } = await ctx.params;
    const fechaKey = decodeURIComponent(fecha || "");
    if (!isValidDateKey(fechaKey)) return NextResponse.json({ ok: false, error: "fecha inválida" }, { status: 400 });
    const sql = db();
    const rows = normRows(await sql.query(`SELECT fecha::text as fecha, valor::float8 as valor FROM app.fx WHERE fecha = $1::date LIMIT 1`, [fechaKey]));
    return NextResponse.json({ ok: true, row: rows[0] ?? null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ fecha: string }> }) {
  try {
    const { fecha } = await ctx.params;
    const fechaKey = decodeURIComponent(fecha || "");
    const body = await req.json().catch(() => ({} as any));
    const valor = Number(body?.valor);
    if (!isValidDateKey(fechaKey)) return NextResponse.json({ ok: false, error: "fecha inválida" }, { status: 400 });
    if (!Number.isFinite(valor) || valor <= 0) return NextResponse.json({ ok: false, error: "valor inválido" }, { status: 400 });
    const sql = db();
    const rows = normRows(await sql.query(`UPDATE app.fx SET valor = $2 WHERE fecha = $1::date RETURNING fecha::text as fecha, valor::float8 as valor`, [fechaKey, valor]));
    if (!rows.length) return NextResponse.json({ ok: false, error: "no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, row: rows[0] ?? null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
