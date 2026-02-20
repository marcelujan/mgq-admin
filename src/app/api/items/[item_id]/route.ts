import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function parseItemKey(itemKey: string): { kind: "PROVEEDOR" | "FORMULADO" | "MANUAL"; id: number } | null {
  const s = String(itemKey || "").trim();

  const m = s.match(/^(p|fprod|mopt):(\d+)$/i);
  if (!m) return null;

  const prefix = m[1].toLowerCase();
  const id = Number(m[2]);
  if (!Number.isFinite(id) || id <= 0) return null;

  if (prefix === "p") return { kind: "PROVEEDOR", id };
  if (prefix === "fprod") return { kind: "FORMULADO", id };
  if (prefix === "mopt") return { kind: "MANUAL", id };
  return null;
}

async function begin(sql: any) {
  await sql.query("begin");
}
async function commit(sql: any) {
  await sql.query("commit");
}
async function rollback(sql: any) {
  try {
    await sql.query("rollback");
  } catch {
    // ignore
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { item_id: string } }) {
  const parsed = parseItemKey(params.item_id);
  if (!parsed) {
    return NextResponse.json({ error: "item_id inválido. Se espera p:<id> | fprod:<id> | mopt:<id>." }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force") === "1" || searchParams.get("force") === "true";

  const sql = db();

  try {
    await begin(sql);

    if (parsed.kind === "MANUAL") {
      // Dependencias: producto_formula_linea_v2(cost_option_id) -> cost_option
      const dep = await sql.query(
        `select distinct producto_id::bigint as producto_id
         from app.producto_formula_linea_v2
         where cost_option_id = $1
         order by producto_id asc`,
        [parsed.id]
      );
      const deps = Array.isArray(dep?.rows) ? dep.rows : dep;

      if (deps?.length && !force) {
        await rollback(sql);
        return NextResponse.json(
          {
            error: "cost_option está en uso por fórmulas v2. Para borrar igual, reintentar con ?force=1.",
            dependencies: { producto_ids: deps.map((r: any) => Number(r.producto_id)).filter((n: any) => Number.isFinite(n)) },
          },
          { status: 409 }
        );
      }

      // Si force, se eliminan líneas v2 que referencian el cost_option
      if (deps?.length) {
        await sql.query(`delete from app.producto_formula_linea_v2 where cost_option_id = $1`, [parsed.id]);

        // Limpieza: remover encabezados de formula_v2 que quedaron sin líneas
        await sql.query(
          `
          delete from app.producto_formula_v2 pf
          where pf.producto_id in (
            select x.producto_id
            from (select unnest($1::bigint[]) as producto_id) x
            left join app.producto_formula_linea_v2 l on l.producto_id = x.producto_id
            where l.linea_id is null
          )
        `,
          [deps.map((r: any) => Number(r.producto_id))]
        );
      }

      // Borrar historial y registro principal
      await sql.query(`delete from app.cost_option_snapshot where cost_option_id = $1`, [parsed.id]);
      await sql.query(`delete from app.cost_option where cost_option_id = $1`, [parsed.id]);

      await commit(sql);
      return NextResponse.json({ ok: true, deleted: { kind: "MANUAL", cost_option_id: parsed.id } });
    }

    if (parsed.kind === "FORMULADO") {
      const productoId = parsed.id;

      // Dependencias principales (sin contar tablas que vamos a limpiar en cascada por orden):
      // - producto_oferta -> puede estar usado por insumo_fuente / item_formulado
      // - producto_base / producto_costos_produccion / producto_formula* (legacy) / formula v2
      // En modo no-force podríamos bloquear si hay ofertas activas, pero tu requerimiento pide borrado total.
      // Aun así, si hay ofertas activas vinculadas a insumo_fuente, se limpian primero.

      // 1) limpiar insumo_fuente que apunta a ofertas del producto
      await sql.query(
        `
        delete from app.insumo_fuente
        where oferta_id in (select oferta_id from app.producto_oferta where producto_id = $1)
      `,
        [productoId]
      );

      // 2) snapshots y items formulados
      await sql.query(
        `
        delete from app.item_formulado_snapshot
        where item_formulado_id in (select item_formulado_id from app.item_formulado where producto_id = $1)
      `,
        [productoId]
      );
      await sql.query(`delete from app.item_formulado where producto_id = $1`, [productoId]);

      // 3) ofertas del producto
      await sql.query(`delete from app.producto_oferta where producto_id = $1`, [productoId]);

      // 4) formulas (v2 y legacy) y otros adjuntos
      await sql.query(`delete from app.producto_formula_linea_v2 where producto_id = $1`, [productoId]);
      await sql.query(`delete from app.producto_formula_v2 where producto_id = $1`, [productoId]);

      await sql.query(`delete from app.producto_formula_linea where producto_id = $1`, [productoId]);
      await sql.query(`delete from app.producto_formula where producto_id = $1`, [productoId]);

      await sql.query(`delete from app.producto_base where producto_id = $1`, [productoId]);
      await sql.query(`delete from app.producto_costos_produccion where producto_id = $1`, [productoId]);

      // 5) finalmente el producto
      await sql.query(`delete from app.producto where producto_id = $1`, [productoId]);

      await commit(sql);
      return NextResponse.json({ ok: true, deleted: { kind: "FORMULADO", producto_id: productoId } });
    }

    // PROVEEDOR
    {
      const itemId = parsed.id;

      // Dependencias de dominio detectables por FK:
      // - producto_base.item_id puede referenciar items como base (impacta productos)
      const depPb = await sql.query(
        `select producto_id::bigint as producto_id from app.producto_base where item_id = $1 order by producto_id asc`,
        [itemId]
      );
      // NOTE: keep safe parsing
      const pbRows = Array.isArray(depPb?.rows) ? depPb.rows : depPb;
      if (pbRows?.length && !force) {
        await rollback(sql);
        return NextResponse.json(
          {
            error: "item PROVEEDOR está referenciado por producto_base. Para borrar igual, reintentar con ?force=1.",
            dependencies: { producto_ids: pbRows.map((r: any) => Number(r.producto_id)).filter((n: any) => Number.isFinite(n)) },
          },
          { status: 409 }
        );
      }

      if (pbRows?.length) {
        await sql.query(`delete from app.producto_base where item_id = $1`, [itemId]);
      }

      // limpiar dependencias operativas
      await sql.query(`delete from app.pricing_daily_run_items where offer_id in (select offer_id from app.offers where item_id = $1)`, [itemId]);
      await sql.query(`delete from app.item_price_daily_pres where offer_id in (select offer_id from app.offers where item_id = $1)`, [itemId]);
      await sql.query(`delete from app.item_price_daily where offer_id in (select offer_id from app.offers where item_id = $1)`, [itemId]);

      await sql.query(`delete from app.job where item_id = $1`, [itemId]);

      await sql.query(`delete from app.insumo_fuente where item_id = $1`, [itemId]);

      await sql.query(`delete from app.oferta_proveedor where item_id = $1`, [itemId]);
      await sql.query(`delete from app.offers where item_id = $1`, [itemId]);

      await sql.query(`delete from app.item_seguimiento where item_id = $1`, [itemId]);

      await commit(sql);
      return NextResponse.json({ ok: true, deleted: { kind: "PROVEEDOR", item_id: itemId } });
    }
  } catch (e: any) {
    await rollback(sql);
    return NextResponse.json({ error: e?.message || "Error al eliminar item" }, { status: 500 });
  }
}
