// src/app/api/packaging-items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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

// GET /api/packaging-items?include_inactivos=true|false
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const includeInactivos = (searchParams.get("include_inactivos") ?? "false") === "true";

    const sql = db();
    const r: any = await sql.query(
      `
      SELECT packaging_item_id, nombre, descripcion, unidad, costo_unitario_ars, activo, created_at, updated_at
      FROM app.packaging_item
      WHERE ($1::boolean = true) OR (activo = true)
      ORDER BY activo DESC, nombre ASC, packaging_item_id ASC
      `,
      [includeInactivos]
    );

    return NextResponse.json({ ok: true, items: normalizeQueryResult(r) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

// POST /api/packaging-items
// body: { nombre: string, descripcion?: string|null, costo_unitario_ars: number, activo?: boolean }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
    if (!nombre) return NextResponse.json({ ok: false, error: "nombre requerido" }, { status: 400 });

    const costo_unitario_ars = numOrNull(body?.costo_unitario_ars);
    if (costo_unitario_ars === null || costo_unitario_ars < 0) {
      return NextResponse.json({ ok: false, error: "costo_unitario_ars inválido" }, { status: 422 });
    }

    const descripcion = typeof body?.descripcion === "string" ? body.descripcion.trim() : "";
    const activo = body?.activo === false ? false : true;

    const sql = db();
    const r: any = await sql.query(
      `
      INSERT INTO app.packaging_item (nombre, descripcion, unidad, costo_unitario_ars, activo)
      VALUES ($1, $2, 'UN', $3, $4)
      RETURNING packaging_item_id
      `,
      [nombre, descripcion || null, costo_unitario_ars, activo]
    );

    const packaging_item_id = normalizeQueryResult(r)?.[0]?.packaging_item_id;
    return NextResponse.json({ ok: true, packaging_item_id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
