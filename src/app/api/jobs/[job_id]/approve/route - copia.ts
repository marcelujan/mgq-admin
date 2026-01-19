import { NextResponse } from "next/server";
import { db } from "@/lib/db";

function parseJobId(raw: string): bigint | null {
  if (!/^\d+$/.test(raw)) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

// Aprobar un candidato del job_result y persistirlo en app.oferta_proveedor
// body: { candidato_index?: number, candidato?: object }
export async function POST(req: Request, ctx: { params: { job_id: string } }) {
  try {
    const jobId = parseJobId(ctx.params.job_id);
    if (jobId === null) {
      return NextResponse.json(
        { ok: false, error: "job_id inválido (debe ser numérico)" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const candidatoIndex = Number(body?.candidato_index ?? 0);
    const candidatoOverride = body?.candidato;

    const sql = db();

    const jobs = await sql`
      SELECT job_id, item_id
      FROM app.job
      WHERE job_id = ${jobId}
      LIMIT 1
    `;
    const job = Array.isArray(jobs) ? jobs[0] : (jobs as any).rows?.[0];
    if (!job) return NextResponse.json({ ok: false, error: "Job no encontrado" }, { status: 404 });
    if (!job.item_id) return NextResponse.json({ ok: false, error: "Job sin item_id" }, { status: 400 });

    const results = await sql`
      SELECT candidatos
      FROM app.job_result
      WHERE job_id = ${jobId}
      LIMIT 1
    `;
    const jr = Array.isArray(results) ? results[0] : (results as any).rows?.[0];

    const candidatos: any[] = Array.isArray(jr?.candidatos) ? jr.candidatos : [];
    const candidato = candidatoOverride ?? candidatos[candidatoIndex];
    if (!candidato) {
      return NextResponse.json({ ok: false, error: "No hay candidato para aprobar" }, { status: 400 });
    }

    // Mapping candidato -> columnas oferta_proveedor
    const oferta = {
      item_id: BigInt(job.item_id),
      articulo_prov: candidato.articulo_prov ?? null,
      presentacion: candidato.presentacion ?? null,
      uom: String(candidato.uom ?? "UN"),
      costo_base_usd: candidato.costo_base_usd ?? null,
      fx_usado_en_alta: candidato.fx_usado_en_alta ?? null,
      fecha_scrape_base: candidato.fecha_scrape_base ?? null,
      densidad: candidato.densidad ?? null,
      descripcion: candidato.descripcion ?? null,
      habilitada: true,
    };

    // TIPADO explícito para evitar el error TS de Vercel con "inserted[0].oferta_id"
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
    `) as unknown as Array<{ oferta_id: bigint }>;

    const ofertaId = inserted?.[0]?.oferta_id;

    await sql`
      UPDATE app.job
      SET estado = 'SUCCEEDED'::app.job_estado,
          updated_at = now()
      WHERE job_id = ${jobId}
    `;

    await sql`
      UPDATE app.item_seguimiento
      SET estado = 'OK'::app.item_estado,
          updated_at = now()
      WHERE item_id = ${BigInt(job.item_id)}
    `;

    return NextResponse.json(
      { ok: true, oferta_id: ofertaId ? ofertaId.toString() : null },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error aprobando" },
      { status: 500 }
    );
  }
}
