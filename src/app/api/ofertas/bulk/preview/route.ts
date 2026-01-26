import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runMotorForPricesByPresentacion } from "@/lib/motores/runMotorForPricesByPresentacion";

function canonicalizeUrl(raw: string): string | null {
  try {
    const u = new URL(String(raw).trim());
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch {
    return null;
  }
}

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

async function resolveProveedorAndMotor(sql: any, proveedorCodigo: string) {
  let prov: any = null;

  try {
    const a: any = await sql.query(
      `
      SELECT proveedor_id, motor_id_default
      FROM app.proveedor
      WHERE codigo = $1
      LIMIT 1
      `,
      [proveedorCodigo]
    );
    const rowsA = normalizeQueryResult(a);
    prov = rowsA[0] ?? null;
  } catch {
    prov = null;
  }

  if (!prov || !prov.motor_id_default) {
    const b: any = await sql.query(
      `
      SELECT p.proveedor_id,
             mp.motor_id AS motor_id_default
      FROM app.proveedor p
      LEFT JOIN LATERAL (
        SELECT motor_id
        FROM app.motor_proveedor
        WHERE proveedor_id = p.proveedor_id
        ORDER BY motor_id ASC
        LIMIT 1
      ) mp ON true
      WHERE p.codigo = $1
      LIMIT 1
      `,
      [proveedorCodigo]
    );
    const rowsB = normalizeQueryResult(b);
    prov = rowsB[0] ?? prov;
  }

  return {
    proveedor_id: prov?.proveedor_id ?? null,
    motor_id: prov?.motor_id_default ?? null,
  };
}

// POST /api/ofertas/bulk/preview
// body: { proveedor_codigo, url }
export async function POST(req: NextRequest) {
  try {
    const sql = db();
    const body = await req.json().catch(() => ({} as any));

    const urlRaw = typeof body?.url === "string" ? body.url.trim() : "";
    const proveedorCodigo = typeof body?.proveedor_codigo === "string" ? body.proveedor_codigo.trim() : "";

    if (!urlRaw) return NextResponse.json({ ok: false, error: "url requerida" }, { status: 400 });
    if (!proveedorCodigo) {
      return NextResponse.json({ ok: false, error: "proveedor_codigo requerido (ej: TD)" }, { status: 400 });
    }

    const urlCanonica = canonicalizeUrl(urlRaw);
    if (!urlCanonica) return NextResponse.json({ ok: false, error: "URL inválida" }, { status: 400 });

    const { proveedor_id, motor_id } = await resolveProveedorAndMotor(sql, proveedorCodigo);

    if (!proveedor_id) {
      return NextResponse.json({ ok: false, error: `proveedor inválido: ${proveedorCodigo}` }, { status: 400 });
    }
    if (!motor_id) {
      return NextResponse.json(
        { ok: false, error: `proveedor ${proveedorCodigo} no tiene motor asociado` },
        { status: 400 }
      );
    }

    const r = await runMotorForPricesByPresentacion(BigInt(motor_id), urlCanonica);
    const prices = Array.isArray((r as any)?.prices) ? (r as any).prices : [];

    return NextResponse.json(
      {
        ok: true,
        proveedor_id: String(proveedor_id),
        motor_id: String(motor_id),
        url_canonica: urlCanonica,
        sourceUrl: String((r as any)?.sourceUrl ?? urlCanonica),
        prices,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
