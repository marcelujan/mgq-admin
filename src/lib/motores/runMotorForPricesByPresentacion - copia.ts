export type PriceByPresentacion = { presentacion: number; priceArs: number; source: string };
export type RunMotorForPricesResult = { sourceUrl: string; prices: PriceByPresentacion[] };

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

/**
 * Presentación robusta:
 * - "0.5000" / "0,5000" => 0.5
 * - Slug WC frecuente: "0-5000" o "0_5000" => 0.5000 => 0.5
 * - "1.0000" => 1
 */
function parsePresentacion(raw: any): number | null {
  if (raw === null || raw === undefined) return null;

  let s = String(raw).trim();
  if (!s) return null;

  // coma decimal -> punto
  s = s.replace(",", ".");

  // Caso slug WooCommerce: "0-2500" / "0_2500"
  // si matchea dígitos + separador + dígitos, convertimos separador a punto
  const m = s.match(/^(\d+)[-_](\d+)$/);
  if (m) {
    s = `${m[1]}.${m[2]}`;
  }

  // limpiar a dígitos y punto (por si viene con texto)
  s = s.replace(/[^\d.]/g, "");
  if (!s) return null;

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Precio ARS por presentación (clave = valor numérico de "pa_presentacion", ej 1.0000, 5.0000).
 * Fuente principal: WooCommerce product variations embebidas (data-product_variations o JS).
 */
function parsePrecioArsByPresentacionFromHtml(
  html: string
): Map<number, { precio_ars: number; source: string }> {
  const byPres = new Map<number, { precio_ars: number; source: string }>();

  const maybeAdd = (presRaw: any, priceRaw: any, source: string) => {
    const presNum = parsePresentacion(presRaw);
    if (presNum === null || !Number.isFinite(presNum)) return;

    const priceNum =
      priceRaw === null || priceRaw === undefined
        ? null
        : typeof priceRaw === "number"
        ? priceRaw
        : parseArsNumber(String(priceRaw));

    if (priceNum === null || !Number.isFinite(priceNum)) return;

    byPres.set(presNum, { precio_ars: Number(priceNum), source });
  };

  // 1) WooCommerce: data-product_variations="[...]"
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
            attrs?.attribute_pa_presentacion ?? attrs?.pa_presentacion ?? attrs?.presentacion ?? null;

          const priceCandidate =
            v?.display_price ??
            v?.display_regular_price ??
            v?.variation_display_price ??
            v?.variation_price ??
            null;

          maybeAdd(presKey, priceCandidate, "wc:data-product_variations.display_price");
        }
      }
    } catch {
      // ignore
    }
  }

  // 2) Fallback: JS inline "product_variations = [...]"
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
              attrs?.attribute_pa_presentacion ?? attrs?.pa_presentacion ?? attrs?.presentacion ?? null;

            const priceCandidate =
              v?.display_price ??
              v?.display_regular_price ??
              v?.variation_display_price ??
              v?.variation_price ??
              null;

            maybeAdd(presKey, priceCandidate, "wc:js.product_variations.display_price");
          }
        }
      } catch {
        // ignore
      }
    }
  }

  return byPres;
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "MGqBot/1.0 (+https://vercel.app)",
        accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`fetch_failed_http_${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function runMotorForPricesByPresentacion(
  motorId: bigint,
  url: string
): Promise<RunMotorForPricesResult> {
  if (motorId !== BigInt(1)) {
    throw new Error(`motor_not_implemented:${motorId.toString()}`);
  }

  const html = await fetchHtml(url);
  const byPres = parsePrecioArsByPresentacionFromHtml(html);

  if (byPres.size === 0) throw new Error("prices_by_presentacion_not_found");

  const prices: PriceByPresentacion[] = Array.from(byPres.entries())
    .map(([presentacion, v]) => ({
      presentacion,
      priceArs: v.precio_ars,
      source: v.source,
    }))
    .filter((x) => Number.isFinite(x.presentacion) && Number.isFinite(x.priceArs) && x.priceArs > 0)
    .sort((a, b) => a.presentacion - b.presentacion);

  if (prices.length === 0) throw new Error("prices_by_presentacion_empty");

  return { sourceUrl: url, prices };
}
