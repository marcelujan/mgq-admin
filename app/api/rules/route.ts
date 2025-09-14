import { sql } from "@/lib/db";

export async function PATCH(req: Request) {
  const body = await req.json();
  const productIds: number[] = body.productIds || [];
  const setPct  = (body.setPct  ?? null) as number | null;
  const setFixed= (body.setFixed?? null) as number | null;

  if (!Array.isArray(productIds) || productIds.length === 0) {
    return new Response("productIds required", { status: 400 });
  }

  // 1) UPDATE masivo
  await sql`
    UPDATE app.pricing_rules r
       SET ganancia_variable_pct = COALESCE(${setPct},  r.ganancia_variable_pct),
           ganancia_fija_ars     = COALESCE(${setFixed},r.ganancia_fija_ars)
     WHERE r.product_id = ANY(${productIds})
       AND r.vigencia_desde <= CURRENT_DATE
       AND (r.vigencia_hasta IS NULL OR r.vigencia_hasta >= CURRENT_DATE)
  `;

  // 2) INSERT de faltantes en bloque
  await sql`
    INSERT INTO app.pricing_rules (product_id, ganancia_fija_ars, ganancia_variable_pct, vigencia_desde)
    SELECT pid, ${setFixed ?? 0}, ${setPct ?? 0}, CURRENT_DATE
    FROM unnest(${productIds}::int[]) AS t(pid)
    WHERE NOT EXISTS (
      SELECT 1 FROM app.pricing_rules r
      WHERE r.product_id = t.pid
        AND r.vigencia_desde <= CURRENT_DATE
        AND (r.vigencia_hasta IS NULL OR r.vigencia_hasta >= CURRENT_DATE)
    )
  `;

  return Response.json({ ok: true });
}
