import { normalizeQueryResult } from "@/lib/api";

export type QueryClient = {
  query: (text: string, params?: any[]) => Promise<any>;
};

export async function ensureProductoFormulaV2Header(
  client: QueryClient,
  producto_id: number,
  lote_ref_g_default = 1000,
): Promise<{ created: boolean; lote_ref_g: number }> {
  const existing = normalizeQueryResult(
    await client.query(
      `
      SELECT producto_id, lote_ref_g::float8 AS lote_ref_g
      FROM app.producto_formula_v2
      WHERE producto_id=$1
      `,
      [producto_id],
    ),
  );

  const lote_ref_g_existing = Number(existing?.[0]?.lote_ref_g);
  if (existing?.length) {
    return {
      created: false,
      lote_ref_g:
        Number.isFinite(lote_ref_g_existing) && lote_ref_g_existing > 0
          ? lote_ref_g_existing
          : lote_ref_g_default,
    };
  }

  await client.query(
    `
    INSERT INTO app.producto_formula_v2 (producto_id, lote_ref_g)
    VALUES ($1, $2)
    ON CONFLICT (producto_id)
    DO NOTHING
    `,
    [producto_id, lote_ref_g_default],
  );

  return { created: true, lote_ref_g: lote_ref_g_default };
}
