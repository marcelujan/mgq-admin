import { NextResponse } from "next/server";
import { db } from "../../../../../../lib/db";

type ApproveBody = {
  candidato_index?: number;
  candidato?: any;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ job_id: string }> }
) {
  try {
    const { job_id } = await params;
    const jobId = BigInt(job_id);

    const body: ApproveBody = await req.json().catch(() => ({} as any));
    const candidatoIndex = Number(body?.candidato_index ?? 0);
    const candidatoOverride = body?.candidato;

    const sql = db();

    // 1) Buscar job e item_id
    const jobRows = await sql`
      SELECT job_id, item_id
      FROM app.job
      WHERE job_id = ${jobId}
      LIMIT 1
    `;
    const job = (jobRows as any)?.[0];

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

    // 2) Candidatos del job_result
    const jrRows = await sql`
      SELECT candidatos
      FROM app.job_result
      WHERE job_id = ${jobId}
      LIMIT 1
    `;
    const jr = (jrRows as any)?.[0];

    const candidatos: any[] = (jr?.candidatos as any[]) || [];
    const candidato = candidatoOverride ?? candidatos[candidatoIndex];

    if (!candidato) {
      return NextResponse.json(
        { ok: false, error: "No hay candidato disponible para aprobar" },
        { status: 400 }
      );
    }

    // 3) Map candidato -> oferta_proveedor
    // NOTA: si el candidato no trae algo, lo dejamos null
    const oferta = {
      item_id: BigInt(job.item_id),
      articulo_prov: candidato.articulo_prov ?? null,
      presentacion: candidato.presentacion ?? null,
      uom: (candidato.uom ?? "UN") as string, // enum app.uom
      costo_base_usd: candidato.costo_base_usd ?? null,
      fx_usado_en_alta: candidato.fx_usado_en_alta ?? null,
      fecha_scrape_base: candidato.fecha_scrape_base ?? null,
      densidad: candidato.densidad ?? null,
      descripcion: candidato.descripcion ?? null,
      habilitada: true,
    };

    // 4) Insert oferta
    const inserted = await sql`
      INSERT INTO app.oferta_proveedor
        (item_id, articulo_prov, presentacion, uom,
         costo_base_usd, fx_usado_en_alta, fecha_scrape_base,
         densidad, descripcion, habilitada, created_at, updated_at)
      VALUES
        (${oferta.item_id}, ${oferta.articulo_prov}, ${oferta.presentacion}, ${oferta.uom}::app.uom,
         ${oferta.costo_base_usd}, ${oferta.fx_usado_en_alta}, ${oferta.fecha_scrape_base},
         ${oferta.densidad}, ${oferta.descripcion}, ${oferta.habilitada}, now(), now())
      RETURNING oferta_id
    `;

    // ✅ FIX del error: TypeScript no sabe que inserted[0] tiene oferta_id,
    // entonces lo sacamos como "any" de forma segura.
    const insertedRow = (inserted as any)?.[0];
    const ofertaId = insertedRow?.oferta_id ?? null;

    // 5) Marcar job e item
    await sql`
      UPDATE app.job
      SET estado = 'SUCCEEDED'::app.job_estado,
          finished_at = now(),
          updated_at = now()
      WHERE job_id = ${jobId}
    `;

    await sql`
      UPDATE app.item_seguimiento
      SET estado = 'OK'::app.item_estado,
          updated_at = now()
      WHERE item_id = ${BigInt(job.item_id)}
    `;

    return NextResponse.json({ ok: true, oferta_id: ofertaId }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error aprobando candidato" },
      { status: 500 }
    );
  }
}
