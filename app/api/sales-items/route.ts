export const runtime = 'nodejs';
import { NextResponse, NextRequest } from 'next/server';
import { z } from 'zod';
import { sql } from '../../../lib/db';

// -------- GET /api/sales-items
const QuerySchema = z.object({
  q: z.string().trim().optional(),
  enabled: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.parse({
      q: searchParams.get("q") ?? undefined,
      enabled: searchParams.get("enabled") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    });

    const like = parsed.q ? `%${parsed.q}%` : null;
    const enabledBool = parsed.enabled === undefined ? null : parsed.enabled === "true";

    const rows = await sql`
      SELECT
        v.id,
        v.producto,
        v.vend_pres,
        v.vend_uom,
        si.dens_g_ml_override,         -- <- viene de sales_items
        v.densidad_usada,
        v.vend_costo_auto,
        v.is_enabled
      FROM app.v_sales_items_enriched AS v
      LEFT JOIN app.sales_items AS si ON si.id = v.id
      WHERE (${like} IS NULL OR v.producto ILIKE ${like})
        AND (${enabledBool} IS NULL OR v.is_enabled = ${enabledBool})
      ORDER BY v.producto ASC
      LIMIT ${parsed.limit} OFFSET ${parsed.offset};
    `;

    return NextResponse.json({ items: rows, limit: parsed.limit, offset: parsed.offset });
  } catch (err: any) {
    console.error("GET /api/sales-items failed", err);
    return NextResponse.json({ error: err?.message ?? "unexpected" }, { status: 500 });
  }
}


// -------- POST /api/sales-items
const PostSchema = z.object({
  product_id: z.number().int().positive(),
  supplier_presentation_id: z.number().int().positive(),
  sku: z.string().nullable().optional(),
  vend_pres: z.number().positive().nullable().optional(),
  dens_g_ml_override: z.number().positive().nullable().optional(),
  vend_lote: z.string().nullable().optional(),
  vend_vence: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  vend_grado: z.string().nullable().optional(),
  vend_origen: z.string().nullable().optional(),
  vend_obs: z.string().nullable().optional(),
  vend_url: z.string().url().nullable().optional(),
  is_enabled: z.boolean().default(true).optional(),
});

export async function POST(req: Request) {
  try {
    const data = PostSchema.parse(await req.json());

    const rows = await sql`
      INSERT INTO app.sales_items (
        product_id,
        supplier_presentation_id,
        sku,
        vend_pres,
        dens_g_ml_override,
        vend_lote,
        vend_vence,
        vend_grado,
        vend_origen,
        vend_obs,
        vend_url,
        is_enabled,
        created_at,
        updated_at
      ) VALUES (
        ${data.product_id},
        ${data.supplier_presentation_id},
        ${data.sku ?? null},
        ${data.vend_pres ?? null},
        ${data.dens_g_ml_override ?? null},
        ${data.vend_lote ?? null},
        ${data.vend_vence ?? null},
        ${data.vend_grado ?? null},
        ${data.vend_origen ?? null},
        ${data.vend_obs ?? null},
        ${data.vend_url ?? null},
        ${data.is_enabled ?? true},
        now(),
        now()
      )
      RETURNING id;
    `;

    const id = rows[0].id as number;
    const v = await sql`SELECT * FROM app.v_sales_items_enriched WHERE id=${id}`;
    return NextResponse.json({ item: v[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'unexpected' }, { status: 400 });
  }
}
