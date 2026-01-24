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
     
    const body = (await request.json().catch(() => ({}))) as any;
    const candidatoIndex = Number(body?.candidato_index ?? 0);
    const candidatoOverride = body?.candidato;

    const sql = db();

    const jobRows = (await sql`
      SELECT job_id, item_id
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

    const jrRows = (await sql`
      SELECT candidatos
      FROM app.job_result
      WHERE job_id = ${jobId}
      LIMIT 1
    `) as any[];

    const candidatos = Array.isArray(jrRows?.[0]?.candidatos)
      ? jrRows[0].candidatos
      : [];

    const candidato = candidatoOverride ?? candidatos[candidatoIndex];
    if (!candidato) {
      return NextResponse.json(
        {
          ok: false,
          error: "No hay candidato para aprobar (index inválido o candidatos vacíos)",
        },
        { status: 400 }
      );
    }

    const oferta = {
      item_id: job.item_id,
      articulo_prov: candidato.articulo_prov ?? null,
      presentacion: candidato.presentacion ?? null,
      uom: candidato.uom ?? "UN",
      costo_base_usd: candidato.costo_base_usd ?? null,
      fx_usado_en_alta: candidato.fx_usado_en_alta ?? null,
      fecha_scrape_base: candidato.fecha_scrape_base ?? null,
      densidad: candidato.densidad ?? null,
      descripcion: candidato.descripcion ?? null,
      habilitada: true,
    };

    const inserted = (await sql`
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

    const ofertaId = inserted?.[0]?.oferta_id;
    if (!ofertaId) {
      return NextResponse.json(
        { ok: false, error: "No se pudo obtener oferta_id del INSERT" },
        { status: 500 }
      );
    }

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
      { ok: true, oferta_id: String(ofertaId) },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error aprobando" },
      { status: 500 }
    );
  }
}
