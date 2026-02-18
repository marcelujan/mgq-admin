import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runMotorForPricesByPresentacion } from "@/lib/motores/runMotorForPricesByPresentacion";

function canonicalizeUrl(raw: string): string | null {
  try {
    const u = new URL(String(raw).trim());
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

  // intento A: proveedor.motor_id_default (si existe)
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

  // intento B: fallback desde motor_proveedor
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

async function upsertOffer(sql: any, args: {
  item_id: number;
  proveedor_id: number | string;
  motor_id: number | string;
  url_original: string;
  url_canonica: string;
  presentacion: number;
}) {
  // dedupe (sin asumir unique index)
  const dup: any = await sql.query(
    `
    SELECT offer_id
    FROM app.offers
    WHERE item_id = $1 AND url_canonica = $2 AND presentacion = $3
    LIMIT 1
    `,
    [args.item_id, args.url_canonica, args.presentacion]
  );
  const dupRows = normalizeQueryResult(dup);
  const existing = dupRows?.[0]?.offer_id;

  if (existing) {
    await sql.query(
      `
      UPDATE app.offers
      SET
        url_original = $2,
        proveedor_id = $3,
        motor_id = $4,
        estado = 'OK',
        updated_at = now()
      WHERE offer_id = $1
      `,
      [existing, args.url_original, args.proveedor_id, args.motor_id]
    );
    return { offer_id: existing, created: false };
  }

  const ins: any = await sql.query(
    `
    INSERT INTO app.offers
      (item_id, proveedor_id, motor_id, url_original, url_canonica, presentacion, estado)
    VALUES
      ($1, $2, $3, $4, $5, $6, 'OK')
    RETURNING offer_id
    `,
    [
      args.item_id,
      args.proveedor_id,
      args.motor_id,
      args.url_original,
      args.url_canonica,
      args.presentacion,
    ]
  );
  const insRows = normalizeQueryResult(ins);
  return { offer_id: insRows?.[0]?.offer_id ?? null, created: true };
}

// GET /api/ofertas?item_id=5
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
      LIMIT 500
    `;

    const res: any = await sql.query(q, [item_id]);
    const rows = normalizeQueryResult(res);

    return NextResponse.json({ ok: true, item_id, count: rows.length, offers: rows }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

// POST /api/ofertas
// body: { item_id, proveedor_codigo, url }
// Inserta TODAS las presentaciones reales encontradas por motor.
export async function POST(req: NextRequest) {
  try {
    const sql = db();
    const body = await req.json().catch(() => ({} as any));

    const item_id = Number(body?.item_id);
    const proveedorCodigo = typeof body?.proveedor_codigo === "string" ? body.proveedor_codigo.trim() : "";
    const urlRaw = typeof body?.url === "string" ? body.url.trim() : "";

    if (!Number.isFinite(item_id) || item_id <= 0) {
      return NextResponse.json({ ok: false, error: "item_id inválido" }, { status: 400 });
    }
    if (!proveedorCodigo) {
      return NextResponse.json({ ok: false, error: "proveedor_codigo requerido" }, { status: 400 });
    }
    if (!urlRaw) {
      return NextResponse.json({ ok: false, error: "url requerida" }, { status: 400 });
    }

    const urlCanonica = canonicalizeUrl(urlRaw);
    if (!urlCanonica) return NextResponse.json({ ok: false, error: "URL inválida" }, { status: 400 });

    const { proveedor_id, motor_id } = await resolveProveedorAndMotor(sql, proveedorCodigo);
    if (!proveedor_id) {
      return NextResponse.json({ ok: false, error: `proveedor inválido: ${proveedorCodigo}` }, { status: 400 });
    }
    if (!motor_id) {
      return NextResponse.json(
        { ok: false, error: `proveedor ${proveedorCodigo} no tiene motor asociado` },
        { status: 400 }
      );
    }

    const r = await runMotorForPricesByPresentacion(BigInt(motor_id), urlCanonica);
    const sourceUrl = String((r as any)?.sourceUrl ?? urlCanonica);
    const prices = Array.isArray((r as any)?.prices) ? (r as any).prices : [];

    if (!prices.length) {
      return NextResponse.json(
        { ok: false, error: "no_prices_by_presentacion", url_canonica: urlCanonica, sourceUrl },
        { status: 422 }
      );
    }

    let created = 0;
    let updated = 0;
    const offer_ids: string[] = [];

    for (const p of prices) {
      const pres = Number(p?.presentacion);
      const priceArs = Number(p?.priceArs);

      // guardamos solo presentaciones válidas con precio válido
      if (!Number.isFinite(pres) || pres <= 0) continue;
      if (!Number.isFinite(priceArs) || priceArs <= 0) continue;

      const u = await upsertOffer(sql, {
        item_id,
        proveedor_id,
        motor_id,
        url_original: urlRaw,
        url_canonica: urlCanonica,
        presentacion: pres,
      });

      if (u.offer_id) offer_ids.push(String(u.offer_id));
      if (u.created) created++;
      else updated++;
    }

    if (created + updated === 0) {
      return NextResponse.json(
        { ok: false, error: "no_valid_presentaciones_to_insert", prices_len: prices.length, url_canonica: urlCanonica },
        { status: 422 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        item_id,
        proveedor_codigo: proveedorCodigo,
        proveedor_id: String(proveedor_id),
        motor_id: String(motor_id),
        url_canonica: urlCanonica,
        sourceUrl,
        inserted_created: created,
        inserted_updated: updated,
        offer_ids,
      },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
