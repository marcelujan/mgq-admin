// src/lib/motores/runMotorForPrice.ts
export type RunMotorForPriceResult = { priceArs: number; sourceUrl: string };

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
    const decPos = Math.max(lastComma, lastDot);
    const intPart = cleaned.slice(0, decPos).replace(/[.,]/g, "");
    const decPart = cleaned.slice(decPos + 1).replace(/[.,]/g, "");
    normalized = `${intPart}.${decPart}`;
  } else if (lastComma !== -1) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = cleaned.replace(/,/g, "");
  }

  const n = Number(normalized);
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
    const presNum = presRaw === null || presRaw === undefined ? null : Number(presRaw);
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

  // 2) Fallback: JS inline con "product_variations = [...]"
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

  return byPres;
}

function pickMinPrice(map: Map<number, { precio_ars: number }>): number | null {
  let best: number | null = null;
  for (const v of map.values()) {
    const p = v?.precio_ars;
    if (!Number.isFinite(p) || p <= 0) continue;
    if (best === null || p < best) best = p;
  }
  return best;
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

/**
 * Motor "precio del día" (sin DB).
 * Implementado: motor_id=1 (PuraQuimica/WooCommerce).
 */
export async function runMotorForPrice(
  motorId: bigint,
  url: string
): Promise<RunMotorForPriceResult> {
  if (motorId !== BigInt(1)) {
    throw new Error(`motor_not_implemented:${motorId.toString()}`);
  }

  const html = await fetchHtml(url);
  const byPres = parsePrecioArsByPresentacionFromHtml(html);
  const priceArs = pickMinPrice(byPres);

  if (priceArs === null) throw new Error("price_not_found");

  return { priceArs, sourceUrl: url };
}
