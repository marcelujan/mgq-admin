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

async function upsertOffer(sql: any, args: {
  item_id: number;
  proveedor_id: number | string;
  motor_id: number | string;
  url_original: string;
  url_canonica: string;
  presentacion: number;
}) {
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

// POST /api/ofertas/bulk
// body: { item_id, proveedor_codigo, urls: string[] }
// Inserta TODAS las presentaciones reales por cada URL.
export async function POST(req: NextRequest) {
  try {
    const sql = db();
    const body = await req.json().catch(() => ({} as any));

    const item_id = Number(body?.item_id);
    const proveedorCodigo = typeof body?.proveedor_codigo === "string" ? body.proveedor_codigo.trim() : "";
    const urls: string[] = Array.isArray(body?.urls) ? body.urls : [];

    if (!Number.isFinite(item_id) || item_id <= 0) {
      return NextResponse.json({ ok: false, error: "item_id inválido" }, { status: 400 });
    }
    if (!proveedorCodigo) {
      return NextResponse.json({ ok: false, error: "proveedor_codigo requerido" }, { status: 400 });
    }
    if (!urls.length) {
      return NextResponse.json({ ok: false, error: "urls[] requerido" }, { status: 400 });
    }

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

    const results: any[] = [];
    let total_created = 0;
    let total_updated = 0;
    let total_urls_ok = 0;
    let total_urls_fail = 0;

    for (const raw of urls) {
      const urlRaw = typeof raw === "string" ? raw.trim() : "";
      const urlCanonica = urlRaw ? canonicalizeUrl(urlRaw) : null;

      if (!urlCanonica) {
        total_urls_fail++;
        results.push({ ok: false, url: raw, error: "URL inválida" });
        continue;
      }

      try {
        const r = await runMotorForPricesByPresentacion(BigInt(motor_id), urlCanonica);
        const sourceUrl = String((r as any)?.sourceUrl ?? urlCanonica);
        const prices = Array.isArray((r as any)?.prices) ? (r as any).prices : [];

        if (!prices.length) {
          total_urls_fail++;
          results.push({ ok: false, url: urlCanonica, sourceUrl, error: "no_prices_by_presentacion" });
          continue;
        }

        let created = 0;
        let updated = 0;
        let valid_presentaciones = 0;

        for (const p of prices) {
          const pres = Number(p?.presentacion);
          const priceArs = Number(p?.priceArs);

          if (!Number.isFinite(pres) || pres <= 0) continue;
          if (!Number.isFinite(priceArs) || priceArs <= 0) continue;

          valid_presentaciones++;

          const u = await upsertOffer(sql, {
            item_id,
            proveedor_id,
            motor_id,
            url_original: urlRaw,
            url_canonica: urlCanonica,
            presentacion: pres,
          });

          if (u.created) created++;
          else updated++;
        }

        if (created + updated === 0) {
          total_urls_fail++;
          results.push({
            ok: false,
            url: urlCanonica,
            sourceUrl,
            error: "no_valid_presentaciones_to_insert",
            prices_len: prices.length,
          });
          continue;
        }

        total_urls_ok++;
        total_created += created;
        total_updated += updated;

        results.push({
          ok: true,
          url: urlCanonica,
          sourceUrl,
          created,
          updated,
          valid_presentaciones,
          prices_len: prices.length,
        });
      } catch (e: any) {
        total_urls_fail++;
        results.push({ ok: false, url: urlCanonica, error: String(e?.message ?? e) });
      }
    }

    return NextResponse.json(
      {
        ok: true,
        item_id,
        proveedor_codigo: proveedorCodigo,
        proveedor_id: String(proveedor_id),
        motor_id: String(motor_id),
        urls_in: urls.length,
        urls_ok: total_urls_ok,
        urls_fail: total_urls_fail,
        inserted_created: total_created,
        inserted_updated: total_updated,
        results,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
