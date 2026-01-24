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

/**
 * Precio ARS observado (MVP): intenta meta tags y patrones "precio ... $1234".
 * Si PuraQuímica no expone precio en HTML sin seleccionar variante, esto puede devolver null (=> WARNING).
 */
function parsePrecioArsFromHtml(html: string): number | null {
  const metaPatterns = [
    /property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i,
    /itemprop=["']price["'][^>]*content=["']([^"']+)["']/i,
    /property=["']og:price:amount["'][^>]*content=["']([^"']+)["']/i,
  ];

  for (const re of metaPatterns) {
    const m = html.match(re);
    if (m?.[1]) {
      const n = parseArsNumber(m[1]);
      if (n !== null) return n;
    }
  }

  // cercano a "price/precio"
  const reNearPrice = /(?:price|precio)[^$]{0,120}\$\s*([0-9][0-9\.,]*)/i;
  {
    const m = html.match(reNearPrice);
    if (m?.[1]) {
      const n = parseArsNumber(m[1]);
      if (n !== null) return n;
    }
  }

  // fallback: primer "$ <número>" razonable
  const reAnyDollar = /\$\s*([0-9][0-9\.,]*)/g;
  for (let m; (m = reAnyDollar.exec(html)); ) {
    const n = parseArsNumber(m[1]);
    if (n !== null) return n;
  }

  return null;
}

function parsePresentationsFromHtml(html: string): number[] {
  const out: number[] = [];

  // 1) Intentar aislar el <select> de presentación (más tolerante)
  const selectMatch = html.match(
    /<select[^>]*(?:pa_presentacion|presentaci[oó]n|presentacion)[^>]*>([\s\S]*?)<\/select>/i
  );

  const scope = selectMatch ? selectMatch[1] : html;

  // 2) Capturar valores desde value="1.0000"
  const optValRe = /<option[^>]*value="([0-9]+(?:\.[0-9]{4})?)"[^>]*>/gi;
  for (let m; (m = optValRe.exec(scope)); ) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) out.push(n);
  }

  // 3) Capturar si el value viene vacío y el número está como texto: <option>1.0000</option>
  const optTextRe = /<option[^>]*>\s*([0-9]+(?:\.[0-9]{4})?)\s*<\/option>/gi;
  for (let m; (m = optTextRe.exec(scope)); ) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) out.push(n);
  }

  // 4) Fallback acotado: query param explícito (sin números sueltos)
  if (out.length === 0) {
    const qpRe = /attribute_pa_presentacion=([0-9]+(?:\.[0-9]{4})?)/gi;
    for (let m; (m = qpRe.exec(html)); ) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) out.push(n);
    }
  }

  // Unique + sort
  return Array.from(new Set(out)).sort((a, b) => a - b);
}

function inferUomAndAmountFromTitleOrUrl(
  title: string | null,
  url: string,
  presValue: number
): { uom: "GR" | "ML" | "UN"; amount: number } {
  const hay = `${title ?? ""} ${url}`.toUpperCase();

  // heurística mínima:
  // - si el producto indica XKG o "KG" -> presValue es Kg => GR
  // - si indica XLT o "LT" o "LITRO" -> presValue es Lt => ML
  // - sino: asumir UN (no ideal, pero explícito)
  if (hay.includes("XKG") || hay.includes(" KG")) {
    return { uom: "GR", amount: Math.round(presValue * 1000) };
  }
  if (hay.includes("XLT") || hay.includes(" LT") || hay.includes("LITRO")) {
    return { uom: "ML", amount: Math.round(presValue * 1000) };
  }
  return { uom: "UN", amount: Math.round(presValue) };
}

async function motorPuraQuimica(sql: any, payload: any, job: JobRow, itemId: bigint | null) {
  const url = normalizeUrl(payload?.url);
  if (!url) {
    return {
      status: "ERROR" as const,
      candidatos: [],
      warnings: [],
      errors: ["payload.url inválida o ausente"],
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

  // Precio ARS observado (web) + FX del día (DB)
  const precio_ars_observado = parsePrecioArsFromHtml(html);

  const fxDb = await getFxToday(sql);
  const fxHtml = parseFxFromHtml(html); // fallback
  const fxUsed = fxDb ?? fxHtml;

  const warnings: string[] = [];
  const errors: string[] = [];

  if (!title) warnings.push("No se pudo extraer el título del producto");

  // Opción B: configurable por proveedor
  if (!sku && !cfg.allowMissingSku) warnings.push("No se pudo extraer SKU");

  // Precio/FX para costo_base_usd
  if (!precio_ars_observado) warnings.push("No se pudo extraer precio ARS observado del HTML");
  if (!fxUsed) warnings.push("FX (BNA venta) no disponible (app.fx) y no se pudo inferir del HTML");

  if (pres.length === 0) errors.push("No se pudieron extraer presentaciones/variantes");

  const fechaScrape = new Date().toISOString();

  const candidatos = pres.map((p) => {
    const { uom, amount } = inferUomAndAmountFromTitleOrUrl(title, url, p);

    const costo_base_usd =
      precio_ars_observado && fxUsed
        ? Number((precio_ars_observado / fxUsed).toFixed(6))
        : null;

    return {
      proveedor_id: job.proveedor_id ?? null,
      item_id: itemId ? String(itemId) : null,

      // campos “de negocio”
      descripcion: title ?? "Producto sin título",
      articulo_prov: sku ?? null,

      // normalización: uom en {GR, ML, UN}
      uom,
      presentacion: amount,

      // Precio base (USD): precio ARS observado / FX BNA venta (DB)
      costo_base_usd,
      fx_usado_en_alta: fxUsed ?? null,
      fecha_scrape_base: fechaScrape,

      // auditoría útil (queda en job_result JSON, no rompe inserts)
      precio_ars_observado: precio_ars_observado ?? null,
      fx_origen: fxDb ? "DB" : fxHtml ? "HTML_FALLBACK" : null,

      densidad: null,

      // opcional: para auditoría
      source_url: url,
      source_presentacion_raw: p,
    };
  });

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
      precio_ars_observado,
      pres_count: pres.length,
      html_snippet: htmlSnippet,
    },
  };
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

    if (status === "OK") {
      // OK -> SUCCEEDED (no requiere revisión humana)
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
          result: { status, candidatos_len: candidatos.length, warnings, errors },
        },
        { status: 200 }
      );
    }

    // WARNING -> WAITING_REVIEW
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
        result: { status, candidatos_len: candidatos.length, warnings, errors },
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
