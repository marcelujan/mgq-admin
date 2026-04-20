import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function rows(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeEstado(v: any): string {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  return ["BORRADOR", "LISTA", "PUBLICADA", "PAUSADA"].includes(s) ? s : "BORRADOR";
}

function normalizeCanal(v: any): string | null {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  return ["WEB", "MERCADO_LIBRE", "DIRECTO"].includes(s) ? s : null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();
    const canal = normalizeCanal(searchParams.get("canal"));
    const estado = searchParams.get("estado") ? normalizeEstado(searchParams.get("estado")) : "";

    const sql = db();
    const r: any = await sql.query(
      `
      SELECT
        p.publicacion_id,
        p.item_comercial_id,
        p.canal,
        p.titulo,
        p.descripcion,
        p.precio_venta_ars,
        p.activa_manual,
        p.canal_external_id,
        p.estado_publicacion,
        p.created_at,
        p.updated_at,
        c.nombre AS item_comercial_nombre
      FROM app.publicacion p
      LEFT JOIN app.item_comercial c ON c.item_comercial_id = p.item_comercial_id
      WHERE
        ($1::text = '' OR p.titulo ILIKE ('%' || $1 || '%') OR COALESCE(c.nombre,'') ILIKE ('%' || $1 || '%'))
        AND ($2::text IS NULL OR p.canal = $2)
        AND ($3::text = '' OR p.estado_publicacion = $3)
      ORDER BY p.updated_at DESC, p.publicacion_id DESC
      `,
      [q, canal, estado]
    );

    return NextResponse.json({ ok: true, items: rows(r) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const item_comercial_id = Number(body?.item_comercial_id);
    if (!Number.isFinite(item_comercial_id)) {
      return NextResponse.json({ ok: false, error: "item_comercial_id inválido" }, { status: 400 });
    }

    const canal = normalizeCanal(body?.canal);
    if (!canal) return NextResponse.json({ ok: false, error: "canal inválido" }, { status: 422 });

    const titulo = typeof body?.titulo === "string" ? body.titulo.trim() : "";
    if (!titulo) return NextResponse.json({ ok: false, error: "titulo requerido" }, { status: 422 });

    const descripcion = typeof body?.descripcion === "string" ? body.descripcion.trim() : "";
    const precio_venta_ars = numOrNull(body?.precio_venta_ars);
    if (precio_venta_ars !== null && precio_venta_ars < 0) {
      return NextResponse.json({ ok: false, error: "precio_venta_ars inválido" }, { status: 422 });
    }

    const activa_manual = body?.activa_manual === true;
    const canal_external_id = typeof body?.canal_external_id === "string" ? body.canal_external_id.trim() : "";
    const estado_publicacion = normalizeEstado(body?.estado_publicacion);

    const sql = db();
    const r: any = await sql.query(
      `
      INSERT INTO app.publicacion
        (item_comercial_id, canal, titulo, descripcion, precio_venta_ars, activa_manual, canal_external_id, estado_publicacion)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING publicacion_id
      `,
      [
        item_comercial_id,
        canal,
        titulo,
        descripcion || null,
        precio_venta_ars,
        activa_manual,
        canal_external_id || null,
        estado_publicacion,
      ]
    );

    const publicacion_id = rows(r)?.[0]?.publicacion_id;
    return NextResponse.json({ ok: true, publicacion_id }, { status: 201 });
  } catch (e: any) {
    const msg = String(e?.message ?? "error");
    if (msg.toLowerCase().includes("unique") && msg.toLowerCase().includes("item_comercial")) {
      return NextResponse.json({ ok: false, error: "ya existe una publicación para ese canal" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
