import { NextResponse } from "next/server";
import { db } from "@/lib/db";

type JobRow = {
  job_id: string | number | bigint;
  tipo: string;
  estado: string;
  prioridad: number | null;
  proveedor_id: string | number | bigint | null;
  item_id: string | number | bigint | null;
  corrida_id: string | number | bigint | null;
  payload: any;
};

type MotorRow = { motor_id: string | number | bigint | null };

function toBigInt(v: any): bigint | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") return v;
  const s = String(v).trim();
  if (!/^\d+$/.test(s)) return null;
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}

function normalizeUrl(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!/^https?:\/\//i.test(s)) return null;
  return s;
}

/**
 * Opción B (configurable por proveedor) sin tocar DB:
 * configuración por hostname de la URL.
 */
function providerConfigFromUrl(url: string) {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    host = "";
  }

  // PuraQuimica: el SKU no viene en la URL, no debe generar WARNING
  if (host.endsWith("puraquimica.com.ar")) {
    return { allowMissingSku: true };
  }

  return { allowMissingSku: false };
}

/**
 * FX desde DB (app.fx): BNA venta del día.
 */
async function getFxToday(sql: any): Promise<number | null> {
  const rows = (await sql`
    SELECT valor
    FROM app.fx
    WHERE fecha = current_date
    LIMIT 1
  `) as any[];

  const v = rows?.[0]?.valor;
  const n = v === null || v === undefined ? null : Number(v);
  return Number.isFinite(n as any) ? (n as number) : null;
}

/**
 * Fallback FX desde HTML (no recomendado como fuente primaria).
 */
function parseFxFromHtml(html: string): number | null {
  // "La cotización de dolar de: $1450.00."
  const m = html.match(
    /cotizaci[oó]n\s+de\s+dolar\s+de:\s*\$?\s*([0-9]+(?:[.,][0-9]+)?)/i
  );
  if (!m) return null;
  const n = Number(String(m[1]).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseTitleFromHtml(html: string): string | null {
  // suele venir como <h1 class="product_title ...">...</h1>
  const m = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (!m) return null;
  return m[1].replace(/\s+/g, " ").trim();
}

function parseSkuFromHtml(html: string): string | null {
  // "SKU: M0007"
  const m = html.match(/SKU:\s*([A-Z0-9_-]+)/i);
  return m ? m[1].trim() : null;
}

/**
 * Parse num ARS robusto: "1.234,56" / "1,234.56" / "1234" / "$ 12.345"
 */
function parseArsNumber(raw: string): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  const cleaned = s.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  let normalized = cleaned;

  if (lastComma !== -1 && lastDot !== -1) {
    // tomar el último separador como decimal
    const decPos = Math.max(lastComma, lastDot);
    const intPart = cleaned.slice(0, decPos).replace(/[.,]/g, "");
    const decPart = cleaned.slice(decPos + 1).replace(/[.,]/g, "");
    normalized = `${intPart}.${decPart}`;
  } else if (lastComma !== -1) {
    // solo coma => coma decimal
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    // solo punto o ninguno
    normalized = cleaned.replace(/,/g, "");
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function decodeHtmlEntities(s: string): string {
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Precio ARS por presentación (clave = valor numérico de "pa_presentacion", ej 1.0000, 5.0000).
 * Fuente principal: WooCommerce product variations embebidas (data-product_variations o JS).
 *
 * NOTA: Si el sitio no expone precios por variante en el HTML, el map puede quedar vacío.
 */
function parsePrecioArsByPresentacionFromHtml(
  html: string,
  fxHint?: number | null
): Map<number, { precio_ars: number; source: string }> {
  const byPres = new Map<number, { precio_ars: number; source: string }>();

  const maybeAdd = (presRaw: any, priceRaw: any, source: string) => {
    const presNum = presRaw === null || presRaw === undefined ? null : Number(presRaw);
    if (presNum === null || !Number.isFinite(presNum)) return;

    const priceNum =
      priceRaw === null || priceRaw === undefined
        ? null
        : typeof priceRaw === "number"
        ? priceRaw
        : parseArsNumber(String(priceRaw));

    if (priceNum === null || !Number.isFinite(priceNum)) return;

    // anti-FX (parser-level): si el "precio" parece ser el FX, lo descartamos
    if (fxHint && priceNum >= fxHint * 0.85 && priceNum <= fxHint * 1.15) return;

    byPres.set(presNum, { precio_ars: Number(priceNum), source });
  };

  // 1) WooCommerce: data-product_variations="[...]"
  // Puede venir con entities (&quot;) dentro del atributo.
  const attrRe = /data-product_variations\s*=\s*(?:"([^"]+)"|'([^']+)')/i;
  const mAttr = html.match(attrRe);
  if (mAttr) {
    const raw = mAttr[1] ?? mAttr[2] ?? "";
    const decoded = decodeHtmlEntities(raw);
    try {
      const arr = JSON.parse(decoded);
      if (Array.isArray(arr)) {
        for (const v of arr) {
          const attrs = v?.attributes ?? {};
          const presKey =
            attrs?.attribute_pa_presentacion ??
            attrs?.pa_presentacion ??
            attrs?.presentacion ??
            null;

          const presVal =
            presKey === null || presKey === undefined ? null : parseFloat(String(presKey));

          const priceCandidate =
            v?.display_price ??
            v?.display_regular_price ??
            v?.variation_display_price ??
            v?.variation_price ??
            null;

          maybeAdd(presVal, priceCandidate, "wc:data-product_variations.display_price");
        }
      }
    } catch {
      // ignore
    }
  }

  // 2) Fallback: buscar JS inline con "product_variations = [...]"
  if (byPres.size === 0) {
    const jsRe = /product_variations\s*=\s*(\[[\s\S]*?\])\s*;?/i;
    const mJs = html.match(jsRe);
    if (mJs?.[1]) {
      try {
        const arr = JSON.parse(mJs[1]);
        if (Array.isArray(arr)) {
          for (const v of arr) {
            const attrs = v?.attributes ?? {};
            const presKey =
              attrs?.attribute_pa_presentacion ??
              attrs?.pa_presentacion ??
              attrs?.presentacion ??
              null;

            const presVal =
              presKey === null || presKey === undefined ? null : parseFloat(String(presKey));

            const priceCandidate =
              v?.display_price ??
              v?.display_regular_price ??
              v?.variation_display_price ??
              v?.variation_price ??
              null;

            maybeAdd(presVal, priceCandidate, "wc:js.product_variations.display_price");
          }
        }
      } catch {
        // ignore
      }
    }
  }

  // 3) Último fallback (solo si hay 1 presentación): intentar extraer un precio único ARS
  // (no sirve para economía de escala; evitamos aplicarlo cuando hay múltiples presentaciones).
  if (byPres.size === 0) {
    const jsonLdRe =
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    for (let m; (m = jsonLdRe.exec(html)); ) {
      const block = m[1];
      try {
        const data = JSON.parse(block);
        const objs = Array.isArray(data) ? data : [data];

        for (const obj of objs) {
          const offers = obj?.offers
            ? Array.isArray(obj.offers)
              ? obj.offers
              : [obj.offers]
            : [];
          for (const off of offers) {
            const cur = String(off?.priceCurrency ?? "").toUpperCase();
            const priceRaw = off?.price;
            const n = priceRaw !== undefined ? parseArsNumber(String(priceRaw)) : null;
            if (cur === "ARS" && n !== null) {
              if (fxHint && n >= fxHint * 0.85 && n <= fxHint * 1.15) continue;
              // NO asignamos a pres acá (no sabemos cuál); lo devuelve vacío.
              break;
            }
          }
        }
      } catch {
        // ignore
      }
    }
  }

  return byPres;
}

function parsePresentationsFromHtml(html: string): number[] {
  const out: number[] = [];

  const selectMatch = html.match(
    /<select[^>]*(?:pa_presentacion|presentaci[oó]n|presentacion)[^>]*>([\s\S]*?)<\/select>/i
  );

  const scope = selectMatch ? selectMatch[1] : html;

  const optValRe = /<option[^>]*value="([0-9]+(?:\.[0-9]{4})?)"[^>]*>/gi;
  for (let m; (m = optValRe.exec(scope)); ) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) out.push(n);
  }

  const optTextRe = /<option[^>]*>\s*([0-9]+(?:\.[0-9]{4})?)\s*<\/option>/gi;
  for (let m; (m = optTextRe.exec(scope)); ) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) out.push(n);
  }

  if (out.length === 0) {
    const qpRe = /attribute_pa_presentacion=([0-9]+(?:\.[0-9]{4})?)/gi;
    for (let m; (m = qpRe.exec(html)); ) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) out.push(n);
    }
  }

  return Array.from(new Set(out)).sort((a, b) => a - b);
}

function inferUomAndAmountFromTitleOrUrl(
  title: string | null,
  url: string,
  presValue: number
): { uom: "GR" | "ML" | "UN"; amount: number } {
  const hay = `${title ?? ""} ${url}`.toUpperCase();

  if (hay.includes("XKG") || hay.includes(" KG")) {
    return { uom: "GR", amount: Math.round(presValue * 1000) };
  }
  if (hay.includes("XLT") || hay.includes(" LT") || hay.includes("LITRO")) {
    return { uom: "ML", amount: Math.round(presValue * 1000) };
  }
  return { uom: "UN", amount: Math.round(presValue) };
}

/**
 * Normalización de costo por unidad base:
 * - GR => precio por 1 GR
 * - ML => precio por 1 ML
 * - UN => precio por 1 UN (equivale al total)
 */
function computeUnitPricing(
  uom: "GR" | "ML" | "UN",
  presentacionAmount: number,
  precioArs: number | null,
  costoUsd: number | null
): { ars_por_unidad: number | null; usd_por_unidad: number | null; unidad_base: string } {
  const unidad_base =
    uom === "GR" ? "ARS/GR, USD/GR" : uom === "ML" ? "ARS/ML, USD/ML" : "ARS/UN, USD/UN";

  if (!Number.isFinite(presentacionAmount) || presentacionAmount <= 0) {
    return { ars_por_unidad: null, usd_por_unidad: null, unidad_base };
  }

  const denom = presentacionAmount;

  const ars_por_unidad =
    precioArs !== null && Number.isFinite(precioArs)
      ? Number((precioArs / denom).toFixed(12))
      : null;

  const usd_por_unidad =
    costoUsd !== null && Number.isFinite(costoUsd)
      ? Number((costoUsd / denom).toFixed(12))
      : null;

  return { ars_por_unidad, usd_por_unidad, unidad_base };
}

/**
 * (3) Economía de escala (comparativo interno):
 * - Calcula el mínimo usd_por_unidad y ars_por_unidad dentro del mismo uom
 * - ratio_vs_min_* = (unit_price / min_unit_price)
 * - is_best_value_* marca las que empatan el mínimo (tolerancia)
 */
function attachScaleEconomyMetrics(candidatos: any[]) {
  const EPS = 1e-12;

  // min por UOM
  const mins: Record<
    string,
    { usd_min: number | null; ars_min: number | null }
  > = {};

  for (const c of candidatos) {
    const uom = String(c?.uom ?? "");
    if (!uom) continue;

    const usd = c?.usd_por_unidad;
    const ars = c?.ars_por_unidad;

    if (!mins[uom]) mins[uom] = { usd_min: null, ars_min: null };

    if (usd !== null && Number.isFinite(usd)) {
      const cur = mins[uom].usd_min;
      mins[uom].usd_min = cur === null ? usd : Math.min(cur, usd);
    }
    if (ars !== null && Number.isFinite(ars)) {
      const cur = mins[uom].ars_min;
      mins[uom].ars_min = cur === null ? ars : Math.min(cur, ars);
    }
  }

  // anexar métricas
  for (const c of candidatos) {
    const uom = String(c?.uom ?? "");
    const m = mins[uom] ?? { usd_min: null, ars_min: null };

    const usd = c?.usd_por_unidad;
    const ars = c?.ars_por_unidad;

    const usd_min = m.usd_min;
    const ars_min = m.ars_min;

    c.usd_por_unidad_min = usd_min;
    c.ars_por_unidad_min = ars_min;

    c.ratio_vs_min_usd =
      usd !== null && Number.isFinite(usd) && usd_min !== null && usd_min > 0
        ? Number((usd / usd_min).toFixed(12))
        : null;

    c.ratio_vs_min_ars =
      ars !== null && Number.isFinite(ars) && ars_min !== null && ars_min > 0
        ? Number((ars / ars_min).toFixed(12))
        : null;

    c.is_best_value_usd =
      usd !== null && Number.isFinite(usd) && usd_min !== null
        ? Math.abs(usd - usd_min) <= Math.max(EPS, usd_min * 1e-9)
        : false;

    c.is_best_value_ars =
      ars !== null && Number.isFinite(ars) && ars_min !== null
        ? Math.abs(ars - ars_min) <= Math.max(EPS, ars_min * 1e-9)
        : false;
  }

  return mins;
}

async function motorPuraQuimica(
  sql: any,
  payload: any,
  job: JobRow,
  itemId: bigint | null
) {

  let url = normalizeUrl(payload?.url);

  if (!url && itemId) {
    const rows = (await sql`
      SELECT url_canonica, url_original
      FROM app.item_seguimiento
      WHERE item_id = ${itemId}
      LIMIT 1
    `) as any[];

    const r = rows?.[0];
    url = normalizeUrl(r?.url_canonica) ?? normalizeUrl(r?.url_original);
  }

  if (!url) {
    return {
      status: "ERROR" as const,
      candidatos: [],
      warnings: [],
      errors: ["payload.url inválida o ausente (y no se pudo resolver por item_id)"],
      meta: {},
    };
  }

  const cfg = providerConfigFromUrl(url);

  const res = await fetch(url, {
    headers: {
      "user-agent": "MGqBot/1.0 (+https://vercel.app)",
      accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    return {
      status: "ERROR" as const,
      candidatos: [],
      warnings: [],
      errors: [`fetch falló: HTTP ${res.status}`],
      meta: { url },
    };
  }

  const html = await res.text();
  const htmlSnippet = html.slice(0, 1200);

  const title = parseTitleFromHtml(html);
  const sku = parseSkuFromHtml(html);
  const pres = parsePresentationsFromHtml(html);

  // FX del día (DB) con fallback HTML
  const fxDb = await getFxToday(sql);
  const fxHtml = parseFxFromHtml(html);
  const fxUsed = fxDb ?? fxHtml;
  const fxOrigen = fxDb ? "DB" : fxHtml ? "HTML_FALLBACK" : null;

  // Precio ARS por presentación (clave = valor pres del select)
  const precioByPres = parsePrecioArsByPresentacionFromHtml(html, fxUsed);

  const warnings: string[] = [];
  const errors: string[] = [];

  if (!title) warnings.push("No se pudo extraer el título del producto");
  if (!sku && !cfg.allowMissingSku) warnings.push("No se pudo extraer SKU");

  if (!fxUsed) {
    warnings.push("FX (BNA venta) no disponible (app.fx) y no se pudo inferir del HTML");
  }

  if (pres.length === 0) {
    errors.push("No se pudieron extraer presentaciones/variantes");
  }

  // warnings sobre precios por presentación
  if (pres.length > 0) {
    if (precioByPres.size === 0) {
      warnings.push("No se pudieron extraer precios ARS por presentación desde el HTML");
    } else if (precioByPres.size < pres.length) {
      const missing = pres.filter((p) => !precioByPres.has(p)).length;
      warnings.push(`Faltan precios ARS para ${missing}/${pres.length} presentaciones`);
    }
  }

  // --- (1) Sanity check anti-FX (no bloqueante) ---
  const SANITY_FX_LO = 0.85;
  const SANITY_FX_HI = 1.15;
  const SANITY_FX_BAND = "0.85-1.15";

  const fechaScrape = new Date().toISOString();

  const candidatos = pres.map((p) => {
    const { uom, amount } = inferUomAndAmountFromTitleOrUrl(title, url, p);

    const priceObj = precioByPres.get(p) ?? null;
    const precio_ars_observado = priceObj?.precio_ars ?? null;
    const precio_ars_source = priceObj?.source ?? null;

    const costo_base_usd =
      precio_ars_observado !== null && fxUsed
        ? Number((precio_ars_observado / fxUsed).toFixed(6))
        : null;

    const sanity_fx_ratio =
      precio_ars_observado !== null && fxUsed
        ? Number((precio_ars_observado / fxUsed).toFixed(6))
        : null;

    const sanity_fx_as_price =
      precio_ars_observado !== null && fxUsed
        ? precio_ars_observado >= fxUsed * SANITY_FX_LO &&
          precio_ars_observado <= fxUsed * SANITY_FX_HI
        : false;

    // --- (2) Precio por unidad base persistido en candidatos ---
    const unit = computeUnitPricing(uom, amount, precio_ars_observado, costo_base_usd);

    return {
      proveedor_id: job.proveedor_id ?? null,
      item_id: itemId ? String(itemId) : null,

      // campos “de negocio”
      descripcion: title ?? "Producto sin título",
      articulo_prov: sku ?? null,

      // normalización: uom en {GR, ML, UN}
      uom,
      presentacion: amount,

      // Precio base (USD) por presentación
      costo_base_usd,
      fx_usado_en_alta: fxUsed ?? null,
      fecha_scrape_base: fechaScrape,

      // auditoría por presentación
      precio_ars_observado,
      precio_ars_source,
      fx_origen: fxOrigen,

      // (2) unit economics (persistido)
      ars_por_unidad: unit.ars_por_unidad,
      usd_por_unidad: unit.usd_por_unidad,
      unidad_base: unit.unidad_base,

      // sanity anti-FX
      sanity_fx_as_price,
      sanity_fx_ratio,
      sanity_fx_band: SANITY_FX_BAND,

      densidad: null,

      // opcional: para auditoría
      source_url: url,
      source_presentacion_raw: p,
    };
  });

  // Warning agregado si hay sospechosos
  const suspects = candidatos.filter((c) => c?.sanity_fx_as_price);
  if (suspects.length > 0) {
    const presList = suspects.map((s) => String(s.source_presentacion_raw)).join(", ");
    warnings.push(
      `SUSPECT_FX_AS_PRICE: ${suspects.length}/${candidatos.length} (presentaciones: ${presList})`
    );
  }

  // Warning si no se puede calcular unit economics (presentacion inválida)
  const unitMissing = candidatos.filter(
    (c) =>
      (c?.precio_ars_observado !== null || c?.costo_base_usd !== null) &&
      (c?.ars_por_unidad === null && c?.usd_por_unidad === null)
  );
  if (unitMissing.length > 0) {
    warnings.push(
      `UNIT_PRICE_MISSING: ${unitMissing.length}/${candidatos.length} (presentacion<=0 o inválida)`
    );
  }

  // --- (3) Economía de escala: ratios vs mínimo (por uom) ---
  const mins = attachScaleEconomyMetrics(candidatos);

  // Info adicional: si no hay mínimo (todo null) por uom, avisar
  const uoms = Object.keys(mins);
  const uomMissingMin = uoms.filter(
    (u) => mins[u]?.usd_min === null && mins[u]?.ars_min === null
  );
  if (uomMissingMin.length > 0) {
    warnings.push(
      `SCALE_MIN_MISSING: sin precios por unidad para uom=${uomMissingMin.join(",")}`
    );
  }

  const status =
    errors.length > 0
      ? ("ERROR" as const)
      : warnings.length > 0
      ? ("WARNING" as const)
      : ("OK" as const);

  return {
    status,
    candidatos,
    warnings,
    errors,
    meta: {
      url,
      title,
      sku,
      fx_db: fxDb,
      fx_html: fxHtml,
      fx_used: fxUsed,
      fx_origen: fxOrigen,
      pres_count: pres.length,
      precios_by_pres_count: precioByPres.size,
      sanity_fx_suspects: suspects.length,
      sanity_fx_band: SANITY_FX_BAND,
      unit_price_missing: unitMissing.length,
      scale_mins_by_uom: mins, // queda como objeto en meta
      html_snippet: htmlSnippet,
    },
  };
}

// ------------------------------------------------------------
// WAITING_REVIEW policy (mgq-admin v2)
//
// Decision (2026-01):
// - "Primera vez" NO fuerza WAITING_REVIEW.
// - Un SCRAPE_URL puede cerrar SUCCEEDED si pasa controles de seguridad
//   y el resultado es consistente.
// - Warnings cosméticos NO bloquean auto-aprobación; solo "señales de riesgo".
// - UOM válidas: GR / ML / UN.
// ------------------------------------------------------------

function isRiskWarning(w: string): boolean {
  const s = (w || "").toLowerCase();

  // Señales de riesgo explícitas (códigos)
  if (s.startsWith("suspect_fx_as_price")) return true;
  if (s.startsWith("unit_price_missing")) return true;
  if (s.startsWith("scale_min_missing")) return true;

  // FX faltante bloquea porque impide costo_base_usd
  if (s.includes("fx") && s.includes("no disponible")) return true;

  // Precios por presentación faltantes / incompletos
  if (s.includes("no se pudieron extraer precios") && s.includes("presentación")) return true;
  if (s.includes("faltan precios") && s.includes("presentaciones")) return true;

  // Por defecto: no riesgo
  return false;
}

function isValidUom(uom: any): uom is "GR" | "ML" | "UN" {
  return uom === "GR" || uom === "ML" || uom === "UN";
}

function isValidCandidateForAutoApprove(c: any): boolean {
  if (!c) return false;
  if (!isValidUom(c.uom)) return false;

  const presentacion = Number(c.presentacion);
  if (!Number.isFinite(presentacion) || presentacion <= 0) return false;

  const precioArs = c.precio_ars_observado;
  if (precioArs === null || precioArs === undefined) return false;
  const precioArsNum = Number(precioArs);
  if (!Number.isFinite(precioArsNum) || precioArsNum <= 0) return false;

  // Si no hay costo_base_usd, no auto-aprobar (dependemos de FX).
  const baseUsd = c.costo_base_usd;
  if (baseUsd === null || baseUsd === undefined) return false;
  const baseUsdNum = Number(baseUsd);
  if (!Number.isFinite(baseUsdNum) || baseUsdNum <= 0) return false;

  return true;
}

export async function POST(_req: Request) {
  const sql = db();

  try {
    // 1) Claim 1 job PENDING -> RUNNING (atómico)
    const pickedRows = (await sql`
      WITH picked AS (
        SELECT job_id
        FROM app.job
        WHERE estado = 'PENDING'::app.job_estado
          AND next_run_at <= now()
          AND (locked_until IS NULL OR locked_until < now())
        ORDER BY prioridad DESC NULLS LAST, next_run_at ASC, job_id ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE app.job j
      SET
        estado = 'RUNNING'::app.job_estado,
        locked_by = 'api/run-next',
        locked_until = now() + interval '5 minutes',
        started_at = COALESCE(started_at, now()),
        last_error = NULL,
        updated_at = now()
      FROM picked
      WHERE j.job_id = picked.job_id
      RETURNING
        j.job_id, j.tipo, j.estado, j.prioridad,
        j.proveedor_id, j.item_id, j.corrida_id, j.payload
    `) as unknown as JobRow[];

    const job = pickedRows?.[0];
    if (!job) {
      return NextResponse.json({ ok: true, claimed: false }, { status: 200 });
    }

    const jobId = toBigInt(job.job_id);
    const itemId = toBigInt(job.item_id);

    if (!jobId) {
      await sql`
        UPDATE app.job
        SET
          estado = 'PENDING'::app.job_estado,
          last_error = 'job_id invalido (no numerico)',
          locked_by = NULL,
          locked_until = NULL,
          updated_at = now()
        WHERE job_id = ${job.job_id}
      `;
      return NextResponse.json(
        { ok: false, claimed: true, error: "job_id invalido (no numerico)" },
        { status: 500 }
      );
    }

    // 2) Resolver motor_id desde app.item_seguimiento
    let motorId: bigint | null = null;

    if (itemId) {
      const motorRows = (await sql`
        SELECT motor_id
        FROM app.item_seguimiento
        WHERE item_id = ${itemId}
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1
      `) as unknown as MotorRow[];

      motorId = toBigInt(motorRows?.[0]?.motor_id);
    }

    if (!motorId) {
      const msg = `motor_id no encontrado para item_id=${itemId ?? "NULL"}`;
      await sql`
        UPDATE app.job
        SET
          estado = 'PENDING'::app.job_estado,
          last_error = ${msg},
          locked_by = NULL,
          locked_until = NULL,
          updated_at = now()
        WHERE job_id = ${jobId}
      `;
      return NextResponse.json(
        { ok: false, claimed: true, job_id: String(jobId), error: msg },
        { status: 409 }
      );
    }

    // 3) Ejecutar motor
    let motor_version = "v0";
    let status: "OK" | "WARNING" | "ERROR" = "ERROR";
    let candidatos: any[] = [];
    let warnings: string[] = [];
    let errors: string[] = [];

    if (motorId === BigInt(1)) {
      motor_version = "puraquimica_v1";
      const r = await motorPuraQuimica(sql, job.payload, job, itemId);
      status = r.status;
      candidatos = r.candidatos;
      warnings = r.warnings;
      errors = r.errors;
    } else {
      status = "ERROR";
      errors = [`motor_id=${String(motorId)} no implementado`];
    }

    // 4) Upsert job_result (sin updated_at porque no existe)
    await sql`
      INSERT INTO app.job_result (job_id, motor_id, motor_version, status, candidatos, warnings, errors, created_at)
      VALUES (
        ${jobId},
        ${motorId},
        ${motor_version},
        ${status}::app.job_result_status,
        ${JSON.stringify(candidatos)}::jsonb,
        ${JSON.stringify(warnings)}::jsonb,
        ${JSON.stringify(errors)}::jsonb,
        now()
      )
      ON CONFLICT (job_id)
      DO UPDATE SET
        motor_id = EXCLUDED.motor_id,
        motor_version = EXCLUDED.motor_version,
        status = EXCLUDED.status,
        candidatos = EXCLUDED.candidatos,
        warnings = EXCLUDED.warnings,
        errors = EXCLUDED.errors
    `;

    // 5) Estado del job
    if (status === "ERROR") {
      const msg = errors[0] ?? "Error en motor";
      await sql`
        UPDATE app.job
        SET
          estado = 'FAILED'::app.job_estado,
          finished_at = COALESCE(finished_at, now()),
          locked_by = NULL,
          locked_until = NULL,
          last_error = ${msg},
          updated_at = now()
        WHERE job_id = ${jobId}
      `;

      return NextResponse.json(
        { ok: false, claimed: true, job_id: String(jobId), status, error: msg },
        { status: 500 }
      );
    }

    // Política WAITING_REVIEW vs SUCCEEDED:
    // - Solo warnings de riesgo bloquean auto-aprobación.
    // - Debe existir al menos 1 candidato válido (uom/presentacion/precio/costo_base_usd).
    const riskWarnings = (warnings ?? []).filter((w) => isRiskWarning(String(w)));
    const infoWarnings = (warnings ?? []).filter((w) => !isRiskWarning(String(w)));

    const validCandidates = (candidatos ?? []).filter((c) => isValidCandidateForAutoApprove(c));
    const canAutoApprove = riskWarnings.length === 0 && validCandidates.length > 0;

    if (canAutoApprove) {
      await sql`
        UPDATE app.job
        SET
          estado = 'SUCCEEDED'::app.job_estado,
          finished_at = COALESCE(finished_at, now()),
          locked_by = NULL,
          locked_until = NULL,
          updated_at = now()
        WHERE job_id = ${jobId}
      `;

      return NextResponse.json(
        {
          ok: true,
          claimed: true,
          job: {
            job_id: String(jobId),
            item_id: itemId ? String(itemId) : null,
            motor_id: String(motorId),
            tipo: job.tipo,
          },
          result: {
            status,
            candidatos_len: candidatos.length,
            valid_candidates_len: validCandidates.length,
            warnings,
            risk_warnings: riskWarnings,
            info_warnings: infoWarnings,
            errors,
          },
        },
        { status: 200 }
      );
    }

    // Si el motor reportó OK pero no hay candidatos válidos, o hay warnings de riesgo,
    // se requiere revisión humana.
    await sql`
      UPDATE app.job
      SET
        estado = 'WAITING_REVIEW'::app.job_estado,
        locked_by = NULL,
        locked_until = NULL,
        updated_at = now()
      WHERE job_id = ${jobId}
    `;

    return NextResponse.json(
      {
        ok: true,
        claimed: true,
        job: {
          job_id: String(jobId),
          item_id: itemId ? String(itemId) : null,
          motor_id: String(motorId),
          tipo: job.tipo,
        },
        result: {
          status,
          candidatos_len: candidatos.length,
          valid_candidates_len: validCandidates.length,
          warnings,
          risk_warnings: riskWarnings,
          info_warnings: infoWarnings,
          errors,
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error en run-next" },
      { status: 500 }
    );
  }
}
