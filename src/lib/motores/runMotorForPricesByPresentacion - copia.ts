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

          const presVal = presKey === null || presKey === undefined ? null : parseFloat(String(presKey));

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

            const presVal = presKey === null || presKey === undefined ? null : parseFloat(String(presKey));

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
