import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function normalizeQueryResult(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function isFinitePos(n: any): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

type Issue = { code: string; message: string; ref?: any };

type PrecioResolved =
  | { ok: true; tipo: "MANUAL"; fuente_id: number; costo_por_uom: number }
  | { ok: true; tipo: "ITEM"; fuente_id: number; item_id: number; as_of_date: string; presentacion: number; costo_por_uom: number }
  | { ok: true; tipo: "OFERTA_BULK"; fuente_id: number; oferta_id: number; costo_por_g: number }
  | { ok: false; tipo: "MANUAL" | "ITEM" | "OFERTA_BULK"; fuente_id: number; error: string; ref?: any };

export async function GET(_: NextRequest, ctx: { params: Promise<{ oferta_id: string }> }) {
  try {
    const { oferta_id: ofertaIdStr } = await ctx.params;
    const oferta_id = Number(ofertaIdStr);
    if (!Number.isFinite(oferta_id)) return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 400 });

    const sql = db();
    const issues: Issue[] = [];
    const setIssue = (i: Issue) => issues.push(i);

    // Memoización por request para evitar recalcular subproductos repetidos
    const memo = new Map<number, any>();

    async function resolvePrecioItem(item_id: number, presentacion_preferida: number): Promise<PrecioResolved> {
      if (!isFinitePos(presentacion_preferida)) {
        return { ok: false, tipo: "ITEM", fuente_id: -1, error: "presentacion_preferida requerida", ref: { item_id, presentacion_preferida } };
      }

      const lastRes: any = await sql.query(`SELECT MAX(as_of_date) AS last_date FROM app.item_price_daily_pres WHERE item_id=$1`, [item_id]);
      const last_date = normalizeQueryResult(lastRes)?.[0]?.last_date ?? null;
      if (!last_date) {
        return { ok: false, tipo: "ITEM", fuente_id: -1, error: "item sin precios diarios", ref: { item_id } };
      }

      const priceRes: any = await sql.query(
        `SELECT item_id, as_of_date, presentacion, price_ars
         FROM app.item_price_daily_pres
         WHERE item_id=$1 AND as_of_date=$2 AND presentacion=$3
         LIMIT 1`,
        [item_id, last_date, presentacion_preferida]
      );
      const row = normalizeQueryResult(priceRes)?.[0] ?? null;
      if (!row) {
        return { ok: false, tipo: "ITEM", fuente_id: -1, error: "presentación preferida no encontrada en último día", ref: { item_id, as_of_date: String(last_date), presentacion_preferida } };
      }

      const price_ars = Number(row.price_ars);
      const presentacion = Number(row.presentacion);
      if (!Number.isFinite(price_ars) || !Number.isFinite(presentacion) || presentacion <= 0) {
        return { ok: false, tipo: "ITEM", fuente_id: -1, error: "precio/presentación inválidos", ref: { item_id, as_of_date: String(last_date), presentacion } };
      }

      return { ok: true, tipo: "ITEM", fuente_id: -1, item_id, as_of_date: String(last_date), presentacion, costo_por_uom: price_ars / presentacion };
    }

    async function resolveCostoInsumo(insumo_id: number, visitedOffers: Set<number>): Promise<{ costo_unitario: number | null; insumo: any; fuente?: any }> {
      const iRes: any = await sql.query(`SELECT * FROM app.insumo WHERE insumo_id=$1 LIMIT 1`, [insumo_id]);
      const insumo = normalizeQueryResult(iRes)?.[0] ?? null;
      if (!insumo) {
        setIssue({ code: "INSUMO_NOT_FOUND", message: `Insumo ${insumo_id} no encontrado.`, ref: { insumo_id } });
        return { costo_unitario: null, insumo: null };
      }

      const fRes: any = await sql.query(
        `SELECT * FROM app.insumo_fuente
         WHERE insumo_id=$1 AND habilitada=true
         ORDER BY prioridad ASC, fuente_id ASC
         LIMIT 1`,
        [insumo_id]
      );
      const fuente = normalizeQueryResult(fRes)?.[0] ?? null;
      if (!fuente) {
        setIssue({ code: "INSUMO_PRICE_MISSING", message: `Insumo ${insumo_id}: sin fuente habilitada.`, ref: { insumo_id } });
        return { costo_unitario: null, insumo, fuente: null };
      }

      const tipo = String(fuente.tipo || "").toUpperCase();

      if (tipo === "MANUAL") {
        const c = Number(fuente.costo_por_uom_ars);
        if (!Number.isFinite(c) || c < 0) {
          setIssue({ code: "INSUMO_PRICE_MISSING", message: `Insumo ${insumo_id}: costo manual inválido.`, ref: { insumo_id, fuente_id: Number(fuente.fuente_id) } });
          return { costo_unitario: null, insumo, fuente };
        }
        return { costo_unitario: c, insumo, fuente };
      }

      if (tipo === "ITEM") {
        const item_id = Number(fuente.item_id);
        const prefRaw = fuente.presentacion_preferida;
        const pref = prefRaw === null || prefRaw === undefined ? NaN : Number(prefRaw);
        if (!Number.isFinite(item_id) || item_id <= 0) {
          setIssue({ code: "INSUMO_PRICE_MISSING", message: `Insumo ${insumo_id}: item_id inválido.`, ref: { insumo_id, fuente_id: Number(fuente.fuente_id) } });
          return { costo_unitario: null, insumo, fuente };
        }
        if (!Number.isFinite(pref) || pref <= 0) {
          setIssue({ code: "PREFERRED_PRESENTATION_REQUIRED", message: `Insumo ${insumo_id}: falta presentacion_preferida.`, ref: { insumo_id, item_id, fuente_id: Number(fuente.fuente_id) } });
          return { costo_unitario: null, insumo, fuente };
        }

        const pr = await resolvePrecioItem(item_id, pref);
        if (!pr.ok) {
          setIssue({ code: "PREFERRED_PRESENTATION_NOT_FOUND_LAST_DAY", message: `Insumo ${insumo_id}: ${pr.error}.`, ref: pr.ref ?? { insumo_id, item_id } });
          return { costo_unitario: null, insumo, fuente };
        }

        return { costo_unitario: pr.costo_por_uom, insumo, fuente };
      }

      if (tipo === "OFERTA_BULK") {
        const ofertaBulkIdRaw = fuente.oferta_id;
        const ofertaBulkId = ofertaBulkIdRaw === null || ofertaBulkIdRaw === undefined ? NaN : Number(ofertaBulkIdRaw);
        if (!Number.isFinite(ofertaBulkId) || ofertaBulkId <= 0) {
          setIssue({ code: "INSUMO_PRICE_MISSING", message: `Insumo ${insumo_id}: oferta_id inválido en fuente OFERTA_BULK.`, ref: { insumo_id, fuente_id: Number(fuente.fuente_id) } });
          return { costo_unitario: null, insumo, fuente };
        }

        const sub = await costearOferta(ofertaBulkId, visitedOffers);
        const costo_por_g = sub?.totals?.costo_por_g_ars;
        if (!Number.isFinite(Number(costo_por_g))) {
          setIssue({ code: "INSUMO_PRICE_MISSING", message: `Insumo ${insumo_id}: no se pudo costear oferta BULK ${ofertaBulkId}.`, ref: { insumo_id, oferta_id: ofertaBulkId } });
          return { costo_unitario: null, insumo, fuente };
        }
        return { costo_unitario: Number(costo_por_g), insumo, fuente };
      }

      setIssue({ code: "INSUMO_PRICE_MISSING", message: `Insumo ${insumo_id}: tipo de fuente no soportado (${tipo}).`, ref: { insumo_id, fuente_id: Number(fuente.fuente_id) } });
      return { costo_unitario: null, insumo, fuente };
    }

    function resolveDensidadProducto(params: { oferta: any; producto: any; formula: any | null }): number | null {
      const d1 = params.oferta?.densidad_override_g_ml;
      if (d1 !== null && d1 !== undefined) {
        const dn = Number(d1);
        if (Number.isFinite(dn) && dn > 0) return dn;
      }
      const d2 = params.formula?.densidad_formula_g_ml;
      if (d2 !== null && d2 !== undefined) {
        const dn = Number(d2);
        if (Number.isFinite(dn) && dn > 0) return dn;
      }
      const d3 = params.producto?.densidad_producto_g_ml;
      if (d3 !== null && d3 !== undefined) {
        const dn = Number(d3);
        if (Number.isFinite(dn) && dn > 0) return dn;
      }
      return null;
    }

    function resolveContenidoObjetivoG(params: { oferta: any; densidad_g_ml: number | null }): { objetivo_g: number | null; objetivo_ml: number | null } {
      const o = params.oferta;
      const dens = params.densidad_g_ml;

      const peso_neto_g = o?.peso_neto_g === null || o?.peso_neto_g === undefined ? null : Number(o.peso_neto_g);
      const volumen_neto_ml = o?.volumen_neto_ml === null || o?.volumen_neto_ml === undefined ? null : Number(o.volumen_neto_ml);
      const unidades_pack = o?.unidades_pack === null || o?.unidades_pack === undefined ? null : Number(o.unidades_pack);

      if (Number.isFinite(peso_neto_g) && peso_neto_g > 0) {
        return { objetivo_g: peso_neto_g, objetivo_ml: dens ? peso_neto_g / dens : null };
      }

      if (Number.isFinite(volumen_neto_ml) && volumen_neto_ml > 0) {
        if (dens === null) {
          return { objetivo_g: null, objetivo_ml: volumen_neto_ml };
        }
        return { objetivo_g: volumen_neto_ml * dens, objetivo_ml: volumen_neto_ml };
      }

      if (Number.isFinite(unidades_pack) && unidades_pack > 0) {
        const masa_por_unidad_g = o?.masa_por_unidad_g === null || o?.masa_por_unidad_g === undefined ? null : Number(o.masa_por_unidad_g);
        const volumen_por_unidad_ml = o?.volumen_por_unidad_ml === null || o?.volumen_por_unidad_ml === undefined ? null : Number(o.volumen_por_unidad_ml);

        if (Number.isFinite(masa_por_unidad_g) && masa_por_unidad_g > 0) {
          const g = unidades_pack * masa_por_unidad_g;
          return { objetivo_g: g, objetivo_ml: dens ? g / dens : null };
        }

        if (Number.isFinite(volumen_por_unidad_ml) && volumen_por_unidad_ml > 0) {
          if (dens === null) return { objetivo_g: null, objetivo_ml: unidades_pack * volumen_por_unidad_ml };
          return { objetivo_g: unidades_pack * volumen_por_unidad_ml * dens, objetivo_ml: unidades_pack * volumen_por_unidad_ml };
        }

        return { objetivo_g: null, objetivo_ml: null };
      }

      return { objetivo_g: null, objetivo_ml: null };
    }

    async function costearOferta(ofertaId: number, visitedOffers: Set<number>): Promise<any> {
      if (memo.has(ofertaId)) return memo.get(ofertaId);

      if (visitedOffers.has(ofertaId)) {
        const r = { ok: true, status: "INCOMPLETE", issues: [{ code: "CYCLE_DETECTED", message: `Ciclo detectado al costear oferta ${ofertaId}.` }], totals: {} };
        memo.set(ofertaId, r);
        return r;
      }
      const nextVisited = new Set<number>(visitedOffers);
      nextVisited.add(ofertaId);

      const oRes: any = await sql.query(
        `SELECT o.*, p.nombre AS producto_nombre, p.densidad_producto_g_ml
         FROM app.producto_oferta o
         JOIN app.producto p ON p.producto_id = o.producto_id
         WHERE o.oferta_id=$1
         LIMIT 1`,
        [ofertaId]
      );
      const oferta = normalizeQueryResult(oRes)?.[0] ?? null;
      if (!oferta) {
        const r = { ok: false, error: "oferta no encontrada" };
        memo.set(ofertaId, r);
        return r;
      }

      const producto_id = Number(oferta.producto_id);

      const fRes: any = await sql.query(`SELECT * FROM app.producto_formula WHERE producto_id=$1 LIMIT 1`, [producto_id]);
      const formula = normalizeQueryResult(fRes)?.[0] ?? null;

      const bRes: any = await sql.query(`SELECT * FROM app.producto_base WHERE producto_id=$1 LIMIT 1`, [producto_id]);
      const base = normalizeQueryResult(bRes)?.[0] ?? null;

      const lRes: any = await sql.query(
        `SELECT linea_id, producto_id, insumo_id, pct_peso, orden
         FROM app.producto_formula_linea
         WHERE producto_id=$1
         ORDER BY orden ASC, linea_id ASC`,
        [producto_id]
      );
      const lineas = normalizeQueryResult(lRes);

      const eRes: any = await sql.query(
        `SELECT extra_id, oferta_id, tipo, insumo_id, cantidad, concepto, costo_ars, orden
         FROM app.producto_oferta_extra
         WHERE oferta_id=$1
         ORDER BY orden ASC, extra_id ASC`,
        [ofertaId]
      );
      const extras = normalizeQueryResult(eRes);

      const is_bulk = oferta.is_bulk === true;
      const densidad = resolveDensidadProducto({ oferta, producto: oferta, formula });
      const obj = resolveContenidoObjetivoG({ oferta, densidad_g_ml: densidad });

      if (!Number.isFinite(Number(obj.objetivo_g)) || Number(obj.objetivo_g) <= 0) {
        if (obj.objetivo_ml !== null && obj.objetivo_g === null) {
          setIssue({ code: "PRODUCT_DENSITY_REQUIRED", message: `Oferta ${ofertaId}: falta densidad para convertir ML->g.`, ref: { oferta_id: ofertaId, producto_id } });
        } else {
          setIssue({ code: "OFFER_PRESENTATION_INVALID", message: `Oferta ${ofertaId}: presentación inválida.`, ref: { oferta_id: ofertaId } });
        }
        const r = { ok: true, status: "INCOMPLETE", issues, totals: {} };
        memo.set(ofertaId, r);
        return r;
      }

      const contenido_objetivo_g = Number(obj.objetivo_g);

      // Contenido real: en ofertas BULK se ignora merma siempre (por decisión); en otras ofertas se conserva la lógica existente.
      let contenido_real_g = contenido_objetivo_g;
      if (!is_bulk) {
        const merma = oferta.merma_pct === null || oferta.merma_pct === undefined ? null : Number(oferta.merma_pct);
        if (Number.isFinite(merma) && merma > 0 && merma < 100) {
          contenido_real_g = contenido_objetivo_g / (1 - merma / 100);
        }
      }

      let costo_contenido_ars: number | null = 0;

      if (formula) {
        // Fórmula en % p/p
        for (const l of lineas) {
          const insumo_id = Number(l.insumo_id);
          const pct = Number(l.pct_peso);
          if (!Number.isFinite(insumo_id) || insumo_id <= 0) continue;
          if (!Number.isFinite(pct) || pct < 0) continue;

          const masa_g = (contenido_real_g * pct) / 100;
          const res = await resolveCostoInsumo(insumo_id, nextVisited);

          if (res.costo_unitario === null || !res.insumo) {
            costo_contenido_ars = null;
            continue;
          }

          const tipo_uom = String(res.insumo.tipo_uom || "").toUpperCase();
          if (tipo_uom === "UN") {
            setIssue({ code: "FORMULA_UN_NOT_ALLOWED", message: `Insumo ${insumo_id}: tipo_uom=UN no debe estar en % p/p.`, ref: { insumo_id, linea_id: Number(l.linea_id) } });
            continue;
          }

          if (tipo_uom === "GR") {
            costo_contenido_ars = costo_contenido_ars === null ? null : costo_contenido_ars + masa_g * res.costo_unitario;
            continue;
          }

          if (tipo_uom === "ML") {
            const dens_insumo_raw = res.insumo.densidad_g_ml;
            const dens_insumo = dens_insumo_raw === null || dens_insumo_raw === undefined ? null : Number(dens_insumo_raw);
            if (dens_insumo === null || !Number.isFinite(dens_insumo) || dens_insumo <= 0) {
              setIssue({ code: "INSUMO_DENSITY_REQUIRED", message: `Insumo ${insumo_id}: falta densidad_g_ml.`, ref: { insumo_id, linea_id: Number(l.linea_id) } });
              costo_contenido_ars = null;
              continue;
            }
            const volumen_ml = masa_g / dens_insumo;
            costo_contenido_ars = costo_contenido_ars === null ? null : costo_contenido_ars + volumen_ml * res.costo_unitario;
            continue;
          }

          setIssue({ code: "INSUMO_UOM_UNKNOWN", message: `Insumo ${insumo_id}: tipo_uom desconocido (${tipo_uom}).`, ref: { insumo_id } });
          costo_contenido_ars = null;
        }
      } else if (base) {
        // Producto base (sin fórmula)
        if (String(base.tipo_base).toUpperCase() === "INSUMO") {
          const insumo_id = Number(base.insumo_id);
          const res = await resolveCostoInsumo(insumo_id, nextVisited);

          if (res.costo_unitario === null || !res.insumo) {
            costo_contenido_ars = null;
          } else {
            const tipo_uom = String(res.insumo.tipo_uom || "").toUpperCase();
            if (tipo_uom === "GR") {
              costo_contenido_ars = contenido_real_g * res.costo_unitario;
            } else if (tipo_uom === "ML") {
              const dens_insumo_raw = res.insumo.densidad_g_ml;
              const dens_insumo = dens_insumo_raw === null || dens_insumo_raw === undefined ? null : Number(dens_insumo_raw);
              if (dens_insumo === null || !Number.isFinite(dens_insumo) || dens_insumo <= 0) {
                setIssue({ code: "INSUMO_DENSITY_REQUIRED", message: `Insumo base ${insumo_id}: falta densidad_g_ml.`, ref: { insumo_id } });
                costo_contenido_ars = null;
              } else {
                const volumen_ml = contenido_real_g / dens_insumo;
                costo_contenido_ars = volumen_ml * res.costo_unitario;
              }
            } else if (tipo_uom === "UN") {
              setIssue({ code: "BASE_UN_NOT_SUPPORTED", message: `Producto base con insumo UN no soportado para costeo por g.`, ref: { insumo_id } });
              costo_contenido_ars = null;
            } else {
              costo_contenido_ars = null;
            }
          }
        } else if (String(base.tipo_base).toUpperCase() === "ITEM") {
          const item_id = Number(base.item_id);
          const prefRaw = base.presentacion_preferida;
          const pref = prefRaw === null || prefRaw === undefined ? NaN : Number(prefRaw);
          const pr = await resolvePrecioItem(item_id, pref);
          if (!pr.ok) {
            setIssue({ code: "PREFERRED_PRESENTATION_NOT_FOUND_LAST_DAY", message: `Producto base ITEM: ${pr.error}.`, ref: pr.ref ?? { item_id } });
            costo_contenido_ars = null;
          } else {
            // Asumimos GR
            costo_contenido_ars = contenido_real_g * pr.costo_por_uom;
          }
        } else {
          costo_contenido_ars = null;
        }
      } else {
        setIssue({ code: "PRODUCT_CONTENT_MISSING", message: `Producto ${producto_id}: sin base ni fórmula.`, ref: { producto_id } });
        costo_contenido_ars = null;
      }

      // Extras (ignorados en BULK)
      let costo_extras_ars: number | null = 0;
      if (!is_bulk) {
        for (const ex of extras) {
          const tipo = String(ex.tipo || "").toUpperCase();
          if (tipo === "COSTO") {
            const c = Number(ex.costo_ars);
            if (!Number.isFinite(c)) {
              setIssue({ code: "EXTRA_INVALID", message: `Extra costo inválido.`, ref: { extra_id: Number(ex.extra_id), oferta_id: ofertaId } });
              costo_extras_ars = null;
              continue;
            }
            costo_extras_ars = costo_extras_ars === null ? null : costo_extras_ars + c;
          } else if (tipo === "INSUMO") {
            const insumo_id = Number(ex.insumo_id);
            const cantidad = Number(ex.cantidad);
            if (!Number.isFinite(insumo_id) || insumo_id <= 0 || !Number.isFinite(cantidad)) {
              setIssue({ code: "EXTRA_INVALID", message: `Extra insumo inválido.`, ref: { extra_id: Number(ex.extra_id), oferta_id: ofertaId } });
              costo_extras_ars = null;
              continue;
            }
            const res = await resolveCostoInsumo(insumo_id, nextVisited);
            if (res.costo_unitario === null) {
              costo_extras_ars = null;
              continue;
            }
            costo_extras_ars = costo_extras_ars === null ? null : costo_extras_ars + cantidad * res.costo_unitario;
          } else {
            setIssue({ code: "EXTRA_INVALID", message: `Tipo extra inválido (${tipo}).`, ref: { extra_id: Number(ex.extra_id) } });
            costo_extras_ars = null;
          }
        }
      }

      const costo_total_ars = costo_contenido_ars === null || costo_extras_ars === null ? null : costo_contenido_ars + costo_extras_ars;

      const totals: any = {
        contenido_objetivo_g,
        contenido_real_g,
        costo_contenido_ars,
        costo_extras_ars,
        costo_total_ars,
      };

      if (costo_total_ars !== null) {
        totals.costo_por_g_ars = costo_total_ars / contenido_objetivo_g;
        totals.costo_por_kg_ars = totals.costo_por_g_ars * 1000;
        const dens = densidad;
        totals.costo_por_ml_ars = dens ? totals.costo_por_g_ars * dens : null;
      } else {
        totals.costo_por_g_ars = null;
        totals.costo_por_kg_ars = null;
        totals.costo_por_ml_ars = null;
      }

      const status = costo_total_ars === null ? "INCOMPLETE" : "OK";
      const result = {
        ok: true,
        status,
        oferta: {
          oferta_id: ofertaId,
          producto_id,
          nombre: String(oferta.nombre || ""),
          is_bulk,
        },
        totals,
        issues,
      };

      memo.set(ofertaId, result);
      return result;
    }

    const result = await costearOferta(oferta_id, new Set<number>());
    return NextResponse.json(result, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
