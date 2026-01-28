import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function parseJobId(raw: unknown): bigint | null {
  const s =
    typeof raw === "string"
      ? raw.trim()
      : Array.isArray(raw) && typeof raw[0] === "string"
      ? raw[0].trim()
      : null;

  if (!s) return null;
  if (!/^\d+$/.test(s)) return null;

  try {
    return BigInt(s);
  } catch {
    return null;
  }
}

function isJsonbArray(v: any): v is any[] {
  return Array.isArray(v);
}

function isEmptyJsonbArray(v: any): boolean {
  return Array.isArray(v) && v.length === 0;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ job_id: string }> }
) {
  try {
    const { job_id } = await Promise.resolve(context.params as any);

    const jobId = parseJobId(job_id);
    if (jobId === null) {
      return NextResponse.json(
        { ok: false, error: "job_id inválido (debe ser numérico)" },
        { status: 400 }
      );
    }

    // body opcional: si querés permitir override manual de candidatos (MVP)
    const body = (await request.json().catch(() => ({}))) as any;
    const candidatosOverride = body?.candidatos; // array completo opcional

    const sql = db();

    // 1) Cargar job + validar existencia
    const jobRows = (await sql`
      SELECT job_id, item_id, estado
      FROM app.job
      WHERE job_id = ${jobId}
      LIMIT 1
    `) as any[];

    const job = jobRows?.[0];
    if (!job) {
      return NextResponse.json(
        { ok: false, error: "Job no encontrado" },
        { status: 404 }
      );
    }
    if (!job.item_id) {
      return NextResponse.json(
        { ok: false, error: "Job sin item_id" },
        { status: 400 }
      );
    }

    // Idempotencia simple: si ya está SUCCEEDED, devolver ofertas existentes (si las hay)
    if (job.estado === "SUCCEEDED") {
      const existing = (await sql`
        SELECT oferta_id
        FROM app.oferta_proveedor
        WHERE item_id = ${job.item_id}
        ORDER BY oferta_id ASC
      `) as any[];

      const ofertaIds = existing.map((r) => String(r.oferta_id)).filter(Boolean);
      return NextResponse.json(
        {
          ok: true,
          already_succeeded: true,
          oferta_ids: ofertaIds,
          oferta_id: ofertaIds[0] ?? null,
        },
        { status: 200 }
      );
    }

    // 2) Validar estado esperado del flujo: WAITING_REVIEW
    if (job.estado !== "WAITING_REVIEW") {
      return NextResponse.json(
        {
          ok: false,
          error: `El job no está en WAITING_REVIEW (estado actual: ${job.estado})`,
        },
        { status: 409 }
      );
    }

    // 3) Cargar job_result + validar
    const jrRows = (await sql`
      SELECT status, candidatos, warnings, errors
      FROM app.job_result
      WHERE job_id = ${jobId}
      LIMIT 1
    `) as any[];

    const jr = jrRows?.[0];
    if (!jr) {
      return NextResponse.json(
        { ok: false, error: "No existe job_result para este job" },
        { status: 409 }
      );
    }

    const resultStatus = String(jr.status ?? "");
    if (resultStatus !== "OK" && resultStatus !== "WARNING") {
      return NextResponse.json(
        {
          ok: false,
          error: `job_result.status inválido para aprobar: ${resultStatus}`,
        },
        { status: 409 }
      );
    }

    // errors debe ser []
    if (!isEmptyJsonbArray(jr.errors)) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se puede aprobar: job_result.errors no está vacío",
          errors: jr.errors ?? null,
        },
        { status: 409 }
      );
    }

    const candidatos =
      isJsonbArray(candidatosOverride) && candidatosOverride.length > 0
        ? candidatosOverride
        : isJsonbArray(jr.candidatos)
        ? jr.candidatos
        : [];

    if (candidatos.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No se puede aprobar: candidatos vacíos" },
        { status: 409 }
      );
    }

    // 4) No duplicar: leer existentes para item_id y deduplicar por (uom,presentacion)
    const existing = (await sql`
      SELECT oferta_id, uom::text AS uom, presentacion
      FROM app.oferta_proveedor
      WHERE item_id = ${job.item_id}
      ORDER BY oferta_id ASC
    `) as any[];

    const existingKey = new Set<string>();
    const existingIds = existing.map((r) => String(r.oferta_id)).filter(Boolean);

    for (const r of existing) {
      const key = `${String(r.uom ?? "")}|${String(r.presentacion ?? "")}`;
      existingKey.add(key);
    }

    const insertedIds: string[] = [];
    let skippedExisting = 0;

    // 5) Insertar TODAS las ofertas (según spec: confirmar -> crear todas las ofertas)
    for (const c of candidatos) {
      const uom = (c?.uom ?? "UN") as string;
      const presentacion = c?.presentacion ?? null;
      const key = `${String(uom)}|${String(presentacion)}`;

      if (existingKey.has(key)) {
        skippedExisting++;
        continue;
      }

      const oferta = {
        item_id: job.item_id,
        articulo_prov: c?.articulo_prov ?? null,
        presentacion,
        uom,
        costo_base_usd: c?.costo_base_usd ?? null,
        fx_usado_en_alta: c?.fx_usado_en_alta ?? null,
        fecha_scrape_base: c?.fecha_scrape_base ?? null,
        densidad: c?.densidad ?? null,
        descripcion: c?.descripcion ?? null,
        habilitada: true,
      };

      const ins = (await sql`
        INSERT INTO app.oferta_proveedor
          (item_id, articulo_prov, presentacion, uom,
           costo_base_usd, fx_usado_en_alta, fecha_scrape_base,
           densidad, descripcion, habilitada, created_at, updated_at)
        VALUES
          (${oferta.item_id}, ${oferta.articulo_prov}, ${oferta.presentacion}, ${oferta.uom}::app.uom,
           ${oferta.costo_base_usd}, ${oferta.fx_usado_en_alta}, ${oferta.fecha_scrape_base},
           ${oferta.densidad}, ${oferta.descripcion}, ${oferta.habilitada}, now(), now())
        RETURNING oferta_id
      `) as any[];

      const ofertaId = ins?.[0]?.oferta_id;
      if (ofertaId) {
        insertedIds.push(String(ofertaId));
        existingKey.add(key);
      }
    }

    const allOfertaIds = [...existingIds, ...insertedIds];

    // Si no insertó nada y no había existentes, algo raro: no aprobar.
    if (allOfertaIds.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se insertaron ofertas y no existían ofertas previas para el item",
        },
        { status: 500 }
      );
    }

    // 6) Marcar job + item como OK/SUCCEEDED
    await sql`
      UPDATE app.job
      SET estado = 'SUCCEEDED'::app.job_estado,
          finished_at = COALESCE(finished_at, now()),
          locked_by = NULL,
          locked_until = NULL,
          updated_at = now()
      WHERE job_id = ${jobId}
    `;

    await sql`
      UPDATE app.item_seguimiento
      SET estado = 'OK'::app.item_estado,
          mensaje_error = NULL,
          updated_at = now()
      WHERE item_id = ${job.item_id}
    `;

    return NextResponse.json(
      {
        ok: true,
        oferta_ids: allOfertaIds,
        oferta_id: allOfertaIds[0] ?? null, // compat con frontend viejo
        inserted_count: insertedIds.length,
        skipped_existing: skippedExisting,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error aprobando" },
      { status: 500 }
    );
  }
}
