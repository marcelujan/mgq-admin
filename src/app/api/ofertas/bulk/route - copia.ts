import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function canonicalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch {
    return null;
  }
}

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

async function resolveProveedorAndMotor(sql: any, proveedorCodigo: string) {
  let prov: any = null;

  try {
    const a: any = await sql.query(
      `
      SELECT proveedor_id, motor_id_default
      FROM app.proveedor
      WHERE codigo = $1
      LIMIT 1
      `,
      [proveedorCodigo]
    );
    const rowsA = normalizeQueryResult(a);
    prov = rowsA[0] ?? null;
  } catch {
    prov = null;
  }

  if (!prov || !prov.motor_id_default) {
    const b: any = await sql.query(
      `
      SELECT p.proveedor_id,
             mp.motor_id AS motor_id_default
      FROM app.proveedor p
      LEFT JOIN LATERAL (
        SELECT motor_id
        FROM app.motor_proveedor
        WHERE proveedor_id = p.proveedor_id
        ORDER BY motor_id ASC
        LIMIT 1
      ) mp ON true
      WHERE p.codigo = $1
      LIMIT 1
      `,
      [proveedorCodigo]
    );
    const rowsB = normalizeQueryResult(b);
    prov = rowsB[0] ?? prov;
  }

  return {
    proveedor_id: prov?.proveedor_id ?? null,
    motor_id: prov?.motor_id_default ?? null,
  };
}

// GET /api/offers?item_id=5
export async function GET(req: NextRequest) {
  try {
    const sql = db();
    const { searchParams } = new URL(req.url);
    const itemIdRaw = searchParams.get("item_id");

    if (!itemIdRaw || !/^\d+$/.test(itemIdRaw)) {
      return NextResponse.json({ ok: false, error: "item_id requerido" }, { status: 400 });
    }
    const item_id = Number(itemIdRaw);

    const q = `
      SELECT
        offer_id,
        item_id,
        proveedor_id,
        motor_id,
        url_original,
        url_canonica,
        presentacion,
        estado::text AS estado,
        created_at,
        updated_at
      FROM app.offers
      WHERE item_id = $1
      ORDER BY updated_at DESC NULLS LAST, offer_id DESC
      LIMIT 200
    `;

    const res: any = await sql.query(q, [item_id]);
    const rows = normalizeQueryResult(res);

    return NextResponse.json({ ok: true, item_id, count: rows.length, offers: rows }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

// POST /api/offers
// body: { item_id, proveedor_codigo, url, presentacion }
export async function POST(req: NextRequest) {
  try {
    const sql = db();
    const body = await req.json().catch(() => ({} as any));

    const itemIdRaw = body?.item_id;
    const item_id = Number(itemIdRaw);

    const proveedorCodigo =
      typeof body?.proveedor_codigo === "string" ? body.proveedor_codigo.trim() : "";
    const urlRaw = typeof body?.url === "string" ? body.url.trim() : "";
    const presentacion = Number(body?.presentacion);

    if (!Number.isFinite(item_id) || item_id <= 0) {
      return NextResponse.json({ ok: false, error: "item_id inválido" }, { status: 400 });
    }
    if (!proveedorCodigo) {
      return NextResponse.json({ ok: false, error: "proveedor_codigo requerido" }, { status: 400 });
    }
    if (!urlRaw) return NextResponse.json({ ok: false, error: "url requerida" }, { status: 400 });
    if (!Number.isFinite(presentacion) || presentacion <= 0) {
      return NextResponse.json({ ok: false, error: "presentacion inválida" }, { status: 400 });
    }

    const urlCanonica = canonicalizeUrl(urlRaw);
    if (!urlCanonica) return NextResponse.json({ ok: false, error: "URL inválida" }, { status: 400 });

    const { proveedor_id, motor_id } = await resolveProveedorAndMotor(sql, proveedorCodigo);
    if (!proveedor_id) {
      return NextResponse.json(
        { ok: false, error: `proveedor inválido: ${proveedorCodigo}` },
        { status: 400 }
      );
    }
    if (!motor_id) {
      return NextResponse.json(
        { ok: false, error: `proveedor ${proveedorCodigo} no tiene motor asociado` },
        { status: 400 }
      );
    }

    // dedupe simple (si no tenés unique)
    const dup: any = await sql.query(
      `
      SELECT offer_id
      FROM app.offers
      WHERE item_id = $1 AND url_canonica = $2 AND presentacion = $3
      LIMIT 1
      `,
      [item_id, urlCanonica, presentacion]
    );
    const dupRows = normalizeQueryResult(dup);
    if (dupRows?.[0]?.offer_id) {
      return NextResponse.json(
        { ok: false, error: "Offer ya existe", offer_id: String(dupRows[0].offer_id) },
        { status: 409 }
      );
    }

    const ins: any = await sql.query(
      `
      INSERT INTO app.offers
        (item_id, proveedor_id, motor_id, url_original, url_canonica, presentacion, estado)
      VALUES
        ($1, $2, $3, $4, $5, $6, 'OK')
      RETURNING offer_id
      `,
      [item_id, proveedor_id, motor_id, urlRaw, urlCanonica, presentacion]
    );

    const insRows = normalizeQueryResult(ins);
    const offer_id = insRows?.[0]?.offer_id;

    return NextResponse.json(
      { ok: true, offer_id: offer_id ? String(offer_id) : null },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
