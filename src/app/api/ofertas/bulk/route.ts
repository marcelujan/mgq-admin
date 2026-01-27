// mgq-admin/src/app/api/ofertas/bulk/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runMotorForPricesByPresentacion } from "@/lib/motores/runMotorForPricesByPresentacion";

type BulkBody = {
  proveedor_id?: number | string;
  motor_id?: number | string; // lo manda el front (auto)
  urls?: unknown; // array o string (por compat)
};

function toInt(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function canonicalizeUrl(raw: string): string | null {
  try {
    const u = new URL(String(raw).trim());
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    // normalizar trailing slash (pero dejando "/" raíz)
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch {
    return null;
  }
}

function splitAndCleanUrls(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map((x) => String(x ?? "").trim()).filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function dedupeKeepOrder(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function normalizeMotorPrices(prices: any): Array<{ presentacion: number; priceArs: number }> {
  if (!Array.isArray(prices)) return [];
  return prices
    .map((p) => ({
      presentacion: Number(p?.presentacion),
      priceArs: Number(p?.priceArs),
    }))
    .filter((p) => Number.isFinite(p.presentacion) && Number.isFinite(p.priceArs) && p.priceArs > 0)
    .sort((a, b) => a.presentacion - b.presentacion);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const sql: any = db();

    const body = (await req.json().catch(() => ({} as any))) as BulkBody;

    const proveedor_id = toInt(body?.proveedor_id);
    const motor_id = toInt(body?.motor_id);

    // IMPORTANTE: el front manda "urls" (array). Si acá esperás "url" vas a ver "url requerida".
    const urlsRaw = splitAndCleanUrls(body?.urls);
    const urls = dedupeKeepOrder(urlsRaw);

    if (!proveedor_id) {
      return NextResponse.json({ ok: false, error: "proveedor_id requerido" }, { status: 400 });
    }
    if (!motor_id) {
      return NextResponse.json({ ok: false, error: "motor_id requerido" }, { status: 400 });
    }
    if (urls.length === 0) {
      return NextResponse.json({ ok: false, error: "urls requerida (mínimo 1)" }, { status: 400 });
    }

    // 1) Validar proveedor
    const prov = await sql.query(
      `
      select proveedor_id, nombre, motor_id_default, activo
      from app.proveedor
      where proveedor_id = $1
      limit 1;
      `,
      [proveedor_id]
    );

    const provRow = prov?.rows?.[0];
    if (!provRow) {
      return NextResponse.json(
        { ok: false, error: `proveedor_id inexistente: ${proveedor_id}` },
        { status: 400 }
      );
    }
    if (provRow.activo === false) {
      return NextResponse.json(
        { ok: false, error: `proveedor_id inactivo: ${proveedor_id}` },
        { status: 400 }
      );
    }

    // 2) Si proveedor y motor “van juntos”, forzamos consistencia (evita cargar con motor equivocado)
    const motorDefault = provRow.motor_id_default ? Number(provRow.motor_id_default) : null;
    if (motorDefault && motorDefault !== motor_id) {
      return NextResponse.json(
        {
          ok: false,
          error: `motor_id (${motor_id}) no coincide con motor_id_default del proveedor (${motorDefault})`,
        },
        { status: 400 }
      );
    }

    // 3) Procesar URLs: crear item (si no existe) + crear offers por presentación
    let items_created = 0;
    let offers_created = 0;

    const results: Array<{
      url: string;
      url_canonica: string | null;
      status: "OK" | "ERROR";
      item_id?: number;
      offers_inserted?: number;
      error?: string;
    }> = [];

    for (const urlRaw of urls) {
      const urlCanonica = canonicalizeUrl(urlRaw);
      if (!urlCanonica) {
        results.push({
          url: urlRaw,
          url_canonica: null,
          status: "ERROR",
          error: "URL inválida",
        });
        continue;
      }

      try {
        // 3.1) Motor: extraer presentaciones/precios
        const motorRes: any = await runMotorForPricesByPresentacion(BigInt(motor_id), urlCanonica);
        const prices = normalizeMotorPrices(motorRes?.prices);

        if (prices.length === 0) {
          results.push({
            url: urlRaw,
            url_canonica: urlCanonica,
            status: "ERROR",
            error: "motor_no_devolvio_precios",
          });
          continue;
        }

        // 3.2) Buscar si ya existe item por url_canonica (o url_original)
        // Nota: si no tenés índice/unique, esto igual funciona.
        const existing = await sql.query(
          `
          select item_id
          from app.item_seguimiento
          where url_canonica = $1
             or url_original = $2
          order by item_id asc
          limit 1;
          `,
          [urlCanonica, urlRaw]
        );

        let item_id: number;

        if (existing?.rows?.length) {
          item_id = Number(existing.rows[0].item_id);
        } else {
          // 3.3) Crear item
          const insItem = await sql.query(
            `
            insert into app.item_seguimiento
              (proveedor_id, motor_id, url_original, url_canonica, seleccionado, estado)
            values
              ($1, $2, $3, $4, true, 'OK')
            returning item_id;
            `,
            [proveedor_id, motor_id, urlRaw, urlCanonica]
          );

          item_id = Number(insItem?.rows?.[0]?.item_id);
          if (!Number.isFinite(item_id)) {
            throw new Error("item_id_invalido");
          }
          items_created++;
        }

        // 3.4) Crear offers (una por presentación real)
        // - estado OK
        // - url_original/url_canonica copiados
        // - presentacion NUMERIC en tabla (admite 0.25, 0.5, 1, 5, etc.)
        //
        // Si querés evitar duplicados, necesitás una constraint unique (por ej: (item_id, presentacion, url_canonica)).
        let insertedForThisUrl = 0;
        for (const p of prices) {
          await sql.query(
            `
            insert into app.offers
              (item_id, motor_id, url_original, url_canonica, presentacion, estado)
            values
              ($1, $2, $3, $4, $5, 'OK');
            `,
            [item_id, motor_id, urlRaw, urlCanonica, p.presentacion]
          );
          insertedForThisUrl++;
          offers_created++;
        }

        results.push({
          url: urlRaw,
          url_canonica: urlCanonica,
          status: "OK",
          item_id,
          offers_inserted: insertedForThisUrl,
        });
      } catch (e: any) {
        results.push({
          url: urlRaw,
          url_canonica: urlCanonica,
          status: "ERROR",
          error: String(e?.message ?? e ?? "error"),
        });
      }
    }

    return NextResponse.json(
      {
        ok: true,
        proveedor_id,
        motor_id,
        items_created,
        offers_created,
        results,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e ?? "error") },
      { status: 500 }
    );
  }
}
