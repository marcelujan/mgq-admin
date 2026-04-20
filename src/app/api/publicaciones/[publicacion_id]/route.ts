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
  return ["WEB", "MERCADO_LIBRE"].includes(s) ? s : null;
}

type Ctx = { params: Promise<{ publicacion_id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { publicacion_id: pidStr } = await params;
    const publicacion_id = Number(pidStr);
    if (!Number.isFinite(publicacion_id)) {
      return NextResponse.json({ ok: false, error: "publicacion_id inválido" }, { status: 400 });
    }

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
      WHERE p.publicacion_id = $1
      `,
      [publicacion_id]
    );
    const item = rows(r)?.[0];
    if (!item) return NextResponse.json({ ok: false, error: "no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, item });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { publicacion_id: pidStr } = await params;
    const publicacion_id = Number(pidStr);
    if (!Number.isFinite(publicacion_id)) {
      return NextResponse.json({ ok: false, error: "publicacion_id inválido" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));

    const hasItem = Object.prototype.hasOwnProperty.call(body, "item_comercial_id");
    const item_comercial_id = Number(body?.item_comercial_id);

    const hasCanal = Object.prototype.hasOwnProperty.call(body, "canal");
    const canal = normalizeCanal(body?.canal);

    const hasTitulo = Object.prototype.hasOwnProperty.call(body, "titulo");
    const titulo = typeof body?.titulo === "string" ? body.titulo.trim() : "";

    const hasDescripcion = Object.prototype.hasOwnProperty.call(body, "descripcion");
    const descripcion = typeof body?.descripcion === "string" ? body.descripcion.trim() : "";

    const hasPrecio = Object.prototype.hasOwnProperty.call(body, "precio_venta_ars");
    const precio_venta_ars = numOrNull(body?.precio_venta_ars);

    const hasActiva = Object.prototype.hasOwnProperty.call(body, "activa_manual");
    const activa_manual = body?.activa_manual === true;

    const hasExternal = Object.prototype.hasOwnProperty.call(body, "canal_external_id");
    const canal_external_id = typeof body?.canal_external_id === "string" ? body.canal_external_id.trim() : "";

    const hasEstado = Object.prototype.hasOwnProperty.call(body, "estado_publicacion");
    const estado_publicacion = normalizeEstado(body?.estado_publicacion);

    if (hasItem && !Number.isFinite(item_comercial_id)) {
      return NextResponse.json({ ok: false, error: "item_comercial_id inválido" }, { status: 422 });
    }
    if (hasCanal && !canal) return NextResponse.json({ ok: false, error: "canal inválido" }, { status: 422 });
    if (hasTitulo && !titulo) return NextResponse.json({ ok: false, error: "titulo requerido" }, { status: 422 });
    if (hasPrecio && precio_venta_ars !== null && precio_venta_ars < 0) {
      return NextResponse.json({ ok: false, error: "precio_venta_ars inválido" }, { status: 422 });
    }

    const sql = db();
    const r: any = await sql.query(
      `
      UPDATE app.publicacion
      SET
        item_comercial_id = CASE WHEN $1::boolean THEN $2 ELSE item_comercial_id END,
        canal = CASE WHEN $3::boolean THEN $4 ELSE canal END,
        titulo = CASE WHEN $5::boolean THEN $6 ELSE titulo END,
        descripcion = CASE WHEN $7::boolean THEN $8 ELSE descripcion END,
        precio_venta_ars = CASE WHEN $9::boolean THEN $10 ELSE precio_venta_ars END,
        activa_manual = CASE WHEN $11::boolean THEN $12 ELSE activa_manual END,
        canal_external_id = CASE WHEN $13::boolean THEN $14 ELSE canal_external_id END,
        estado_publicacion = CASE WHEN $15::boolean THEN $16 ELSE estado_publicacion END,
        updated_at = now()
      WHERE publicacion_id = $17
      RETURNING publicacion_id
      `,
      [
        hasItem, item_comercial_id, hasCanal, canal,
        hasTitulo, titulo, hasDescripcion, (hasDescripcion ? (descripcion || null) : null),
        hasPrecio, precio_venta_ars, hasActiva, activa_manual,
        hasExternal, (hasExternal ? (canal_external_id || null) : null),
        hasEstado, estado_publicacion,
        publicacion_id
      ]
    );
    if (!rows(r).length) return NextResponse.json({ ok: false, error: "no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = String(e?.message ?? "error");
    if (msg.toLowerCase().includes("unique") && msg.toLowerCase().includes("item_comercial")) {
      return NextResponse.json({ ok: false, error: "ya existe una publicación para ese canal" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { publicacion_id: pidStr } = await params;
    const publicacion_id = Number(pidStr);
    if (!Number.isFinite(publicacion_id)) {
      return NextResponse.json({ ok: false, error: "publicacion_id inválido" }, { status: 400 });
    }
    const sql = db();
    await sql.query(`DELETE FROM app.publicacion WHERE publicacion_id = $1`, [publicacion_id]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
