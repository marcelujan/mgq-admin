export type BnaUsdVenta = {
  source_url: string;
  page_date: string | null;
  hora_actualizacion: string | null;
  compra: number | null;
  venta: number;
  text_excerpt: string;
};

export type FxUpsertResult = {
  current_date: string;
  previous_value: number | null;
  inserted: boolean;
  updated: boolean;
  row: { fecha: string; valor: number };
};

function decodeHtmlEntities(input: string): string {
  return String(input)
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeHtmlToText(html: string): string {
  return decodeHtmlEntities(String(html ?? ""))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseArs(raw: string | null | undefined): number | null {
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

export function parseBnaUsdVentaFromHtml(html: string, sourceUrl: string): BnaUsdVenta {
  const text = normalizeHtmlToText(html);
  const page_date =
    text.match(/Cotizaci[oó]n\s+Billetes\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+Compra\s+Venta/i)?.[1] ??
    text.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s+Compra\s+Venta\s+Dolar\s+U\.?S\.?A\.?/i)?.[1] ??
    null;
  const hora_actualizacion = text.match(/Hora\s+Actualizaci[oó]n:\s*([0-9]{1,2}:[0-9]{2})/i)?.[1] ?? null;

  const usdMatch =
    text.match(/Cotizaci[oó]n\s+Billetes[\s\S]{0,500}?Dolar\s+U\.?S\.?A\.?\s+([0-9.,]+)\s+([0-9.,]+)/i) ??
    text.match(/Dolar\s+U\.?S\.?A\.?\s+([0-9.,]+)\s+([0-9.,]+)/i);

  const compra = parseArs(usdMatch?.[1] ?? null);
  const venta = parseArs(usdMatch?.[2] ?? null);
  if (!venta || !Number.isFinite(venta) || venta <= 0) {
    throw new Error("no_se_pudo_parsear_usd_venta_bna");
  }

  return {
    source_url: sourceUrl,
    page_date,
    hora_actualizacion,
    compra,
    venta,
    text_excerpt: text.slice(0, 400),
  };
}

export async function fetchBnaUsdVenta(): Promise<BnaUsdVenta> {
  const sourceUrl = process.env.BNA_FX_SOURCE_URL || "https://www.bna.com.ar/Personas";
  const res = await fetch(sourceUrl, {
    method: "GET",
    cache: "no-store",
    headers: {
      "User-Agent": "mgq-admin/1.0 (+cron fx bna)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`bna_http_${res.status}`);
  const html = await res.text();
  return parseBnaUsdVentaFromHtml(html, sourceUrl);
}

export async function hasFxForCurrentDatePg(client: { query: (sql: string, params?: any[]) => Promise<any> }): Promise<boolean> {
  const q = await client.query(`select 1 as ok from app.fx where fecha = current_date limit 1`);
  return Boolean(q?.rows?.[0]?.ok);
}

export async function upsertFxForCurrentDatePg(
  client: { query: (sql: string, params?: any[]) => Promise<any> },
  valor: number,
): Promise<FxUpsertResult> {
  const d0 = await client.query(`select current_date::text as d;`);
  const currentDate = String(d0.rows?.[0]?.d ?? "");
  const beforeQ = await client.query(`select valor::float8 as valor from app.fx where fecha = current_date limit 1`);
  const previous = beforeQ.rows?.[0]?.valor === null || beforeQ.rows?.[0]?.valor === undefined ? null : Number(beforeQ.rows[0].valor);

  const upsertQ = await client.query(
    `
    insert into app.fx (fecha, valor)
    values (current_date, $1)
    on conflict (fecha)
    do update set valor = excluded.valor
    returning fecha::text as fecha, valor::float8 as valor
    `,
    [valor]
  );

  const row = upsertQ.rows?.[0];
  return {
    current_date: currentDate,
    previous_value: previous,
    inserted: previous === null,
    updated: previous !== null,
    row: {
      fecha: String(row?.fecha ?? currentDate),
      valor: Number(row?.valor ?? valor),
    },
  };
}
