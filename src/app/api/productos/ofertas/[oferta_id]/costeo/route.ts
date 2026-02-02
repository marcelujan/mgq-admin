import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../../lib/db";

function rows(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

type IssueCode =
  | "PCT_NO_SUM_100"
  | "FORMULA_DENSITY_REQUIRED"
  | "INSUMO_DENSITY_REQUIRED"
  | "INSUMO_PRICE_MISSING"
  | "PREFERRED_PRESENTATION_REQUIRED"
  | "PREFERRED_PRESENTATION_NOT_FOUND_LAST_DAY"
  | "INVALID_UOM_IN_PCT"
  | "OFFER_PRESENTATION_INCOMPLETE"
  | "CYCLE_DETECTED"
  | "BULK_HAS_EXTRAS"
  | "BULK_COMPONENT_UOM_MISMATCH";

type Issue = { code: IssueCode; message: string; ref?: any };

type PrecioResolved = {
  policy: "PREFERRED_REQUIRED";
  fuente_tipo: "ITEM" | "MANUAL";
  fuente_id: number;
  selected_reason: "MANUAL" | "PREFERRED_PRESENTATION";
  item_id?: number;
  as_of_date?: string;
  presentacion?: number;
  price_ars?: number;
  costo_unitario_ars_por_uom: number | null; // $/g o $/mL o $/UN
};

function isPos(n: any) {
  const x = Number(n);
  return Number.isFinite(x) && x > 0;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ oferta_id: string }> }) {
  try {
    const sql = db();
    const { oferta_id: ofertaIdStr } = await ctx.params;
    const oferta_id = Number(ofertaIdStr);
    if (!Number.isFinite(oferta_id)) return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 400 });

    const debug = new URL(req.url).searchParams.get("debug") === "true";

    const memo = new Map<number, any>();
    const stack = new Set<number>();

    async function resolveCostoInsumo(insumo_id: number, issues: Issue[]): Promise<PrecioResolved> {
      const policy: "PREFERRED_REQUIRED" = "PREFERRED_REQUIRED";

      const fuRes: any = await sql.query(
        `SELECT * FROM app.insumo_fuente WHERE insumo_id=$1 AND habilitada=true ORDER BY prioridad ASC, fuente_id ASC`,
        [insumo_id]
      );
      const fuente = rows(fuRes)?.[0];

      if (!fuente) {
        issues.push({ code: "INSUMO_PRICE_MISSING", message: `Insumo ${insumo_id}: no tiene fuente habilitada.`, ref: { insumo_id } });
        return { policy, fuente_tipo: "MANUAL", fuente_id: -1, selected_reason: "MANUAL", costo_unitario_ars_por_uom: null };
      }

      if (fuente.tipo === "MANUAL") {
        const c = Number(fuente.costo_por_uom_ars);
        if (!Number.isFinite(c) || c < 0) {
          issues.push({ code: "INSUMO_PRICE_MISSING", message: `Insumo ${insumo_id}: costo manual inválido.`, ref: { insumo_id, fuente_id: Number(fuente.fuente_id) } });
          return { policy, fuente_tipo: "MANUAL", fuente_id: Number(fuente.fuente_id), selected_reason: "MANUAL", costo_unitario_ars_por_uom: null };
        }
        return { policy, fuente_tipo: "MANUAL", fuente_id: Number(fuente.fuente_id), selected_reason: "MANUAL", costo_unitario_ars_por_uom: c };
      }

      // ITEM
      const fuente_id = Number(fuente.fuente_id);
      const item_id = Number(fuente.item_id);
      const prefRaw = fuente.presentacion_preferida;
      const prefNum = Number(prefRaw);

      if (!Number.isFinite(prefNum) || prefNum <= 0) {
        issues.push({
          code: "PREFERRED_PRESENTATION_REQUIRED",
          message: `Insumo ${insumo_id}: falta presentacion_preferida (preferida obligatoria).`,
          ref: { insumo_id, item_id, fuente_id },
        });
        return { policy, fuente_tipo: "ITEM", fuente_id, selected_reason: "PREFERRED_PRESENTATION", item_id, costo_unitario_ars_por_uom: null };
      }

      const lastRes: any = await sql.query(`SELECT MAX(as_of_date) AS last_date FROM app.item_price_daily_pres WHERE item_id=$1`, [item_id]);
      const last_date = rows(lastRes)?.[0]?.last_date ?? null;
      if (!last_date) {
        issues.push({
          code: "PREFERRED_PRESENTATION_NOT_FOUND_LAST_DAY",
          message: `Insumo ${insumo_id}: item ${item_id} no tiene precios diarios.`,
          ref: { insumo_id, item_id, fuente_id },
        });
        return { policy, fuente_tipo: "ITEM", fuente_id, selected_reason: "PREFERRED_PRESENTATION", item_id, costo_unitario_ars_por_uom: null };
      }

      const priceRes: any = await sql.query(
        `SELECT item_id, as_of_date, presentacion, price_ars
         FROM app.item_price_daily_pres
         WHERE item_id=$1 AND as_of_date=$2 AND presentacion=$3
         LIMIT 1`,
        [item_id, last_date, prefNum]
      );
      const row = rows(priceRes)?.[0] ?? null;
      if (!row) {
        issues.push({
          code: "PREFERRED_PRESENTATION_NOT_FOUND_LAST_DAY",
          message: `Insumo ${insumo_id}: no existe presentacion_preferida=${prefNum} en el último día (${String(last_date)}).`,
          ref: { insumo_id, item_id, fuente_id },
        });
        return {
          policy,
          fuente_tipo: "ITEM",
          fuente_id,
          selected_reason: "PREFERRED_PRESENTATION",
          item_id,
          as_of_date: String(last_date),
          presentacion: prefNum,
          costo_unitario_ars_por_uom: null,
        };
      }

      const price_ars = Number(row.price_ars);
      const presentacion = Number(row.presentacion);
      if (!Number.isFinite(price_ars) || !Number.isFinite(presentacion) || presentacion <= 0) {
        issues.push({ code: "INSUMO_PRICE_MISSING", message: `Insumo ${insumo_id}: precio/presentación inválidos.`, ref: { insumo_id, item_id, fuente_id } });
        return {
          policy,
          fuente_tipo: "ITEM",
          fuente_id,
          selected_reason: "PREFERRED_PRESENTATION",
          item_id,
          as_of_date: String(last_date),
          presentacion,
          price_ars,
          costo_unitario_ars_por_uom: null,
        };
      }

      return {
        policy,
        fuente_tipo: "ITEM",
        fuente_id,
        selected_reason: "PREFERRED_PRESENTATION",
        item_id,
        as_of_date: String(last_date),
        presentacion,
        price_ars,
        costo_unitario_ars_por_uom: price_ars / presentacion,
      };
    }

    async function costearOferta(ofertaId: number, mode: "FULL" | "CONTENT_ONLY"): Promise<any> {
      if (memo.has(ofertaId)) return memo.get(ofertaId);
      if (stack.has(ofertaId)) {
        const cyc = { ok: true, status: "INCOMPLETO", issues: [{ code: "CYCLE_DETECTED", message: "Ciclo detectado en dependencias BULK." }] };
        memo.set(ofertaId, cyc);
        return cyc;
      }
      stack.add(ofertaId);

      const issues: Issue[] = [];

      const oRes: any = await sql.query(`SELECT * FROM app.producto_oferta WHERE oferta_id=$1 LIMIT 1`, [ofertaId]);
      const oferta = rows(oRes)?.[0];
      if (!oferta) {
        stack.delete(ofertaId);
        const out = { ok: true, status: "INCOMPLETO", issues: [{ code: "OFFER_PRESENTATION_INCOMPLETE", message: "Oferta no encontrada." }] };
        memo.set(ofertaId, out);
        return out;
      }

      const producto_id = Number(oferta.producto_id);

      const pRes: any = await sql.query(`SELECT * FROM app.producto WHERE producto_id=$1 LIMIT 1`, [producto_id]);
      const producto = rows(pRes)?.[0];

      const baseRes: any = await sql.query(`SELECT * FROM app.producto_base WHERE producto_id=$1 LIMIT 1`, [producto_id]);
      const base = rows(baseRes)?.[0] ?? null;

      const fRes: any = await sql.query(`SELECT * FROM app.producto_formula WHERE producto_id=$1 LIMIT 1`, [producto_id]);
      const formula = rows(fRes)?.[0] ?? null;

      const lRes: any = await sql.query(
        `SELECT * FROM app.producto_formula_linea WHERE producto_id=$1 ORDER BY orden ASC, linea_id ASC`,
        [producto_id]
      );
      const lineas = rows(lRes);

      const eRes: any = await sql.query(`SELECT * FROM app.producto_oferta_extra WHERE oferta_id=$1 ORDER BY orden ASC, extra_id ASC`, [ofertaId]);
      const extras = rows(eRes);

      // Densidad usada: oferta override > formula densidad > producto densidad
      const dens_formula =
        oferta.densidad_override_g_ml ?? formula?.densidad_formula_g_ml ?? producto?.densidad_producto_g_ml ?? null;

      // Presentación -> contenido objetivo en g
      const peso_neto_g = oferta.peso_neto_g ?? null;
      const volumen_neto_ml = oferta.volumen_neto_ml ?? null;
      const unidades_pack = oferta.unidades_pack ?? null;
      const masa_por_unidad_g = oferta.masa_por_unidad_g ?? null;
      const volumen_por_unidad_ml = oferta.volumen_por_unidad_ml ?? null;

      let contenido_obj_g: number | null = null;

      if (isPos(peso_neto_g)) {
        contenido_obj_g = Number(peso_neto_g);
      } else if (isPos(volumen_neto_ml)) {
        if (dens_formula === null || !Number.isFinite(Number(dens_formula)) || Number(dens_formula) <= 0) {
          issues.push({ code: "FORMULA_DENSITY_REQUIRED", message: "Falta densidad para costear por mL." });
        } else {
          contenido_obj_g = Number(volumen_neto_ml) * Number(dens_formula);
        }
      } else if (isPos(unidades_pack)) {
        // BULK no debería usar UN, pero FULL para oferta no-bulk sí
        if (isPos(masa_por_unidad_g)) {
          contenido_obj_g = Number(unidades_pack) * Number(masa_por_unidad_g);
        } else if (isPos(volumen_por_unidad_ml)) {
          if (dens_formula === null || !Number.isFinite(Number(dens_formula)) || Number(dens_formula) <= 0) {
            issues.push({ code: "FORMULA_DENSITY_REQUIRED", message: "Falta densidad para UN con volumen/unidad." });
          } else {
            contenido_obj_g = Number(unidades_pack) * Number(volumen_por_unidad_ml) * Number(dens_formula);
          }
        } else {
          issues.push({ code: "OFFER_PRESENTATION_INCOMPLETE", message: "Para UN, definir masa_por_unidad_g o volumen_por_unidad_ml." });
        }
      } else {
        issues.push({ code: "OFFER_PRESENTATION_INCOMPLETE", message: "La oferta debe definir peso, volumen o unidades." });
      }

      const merma_pct = oferta.merma_pct ?? null;
      let contenido_real_g: number | null = contenido_obj_g;
      if (contenido_obj_g !== null && merma_pct !== null && Number.isFinite(Number(merma_pct)) && Number(merma_pct) > 0 && Number(merma_pct) < 100) {
        contenido_real_g = contenido_obj_g / (1 - Number(merma_pct) / 100);
      }

      // Si es BULK y tiene extras, marcamos issue y los ignoramos (siempre)
      const is_bulk = oferta.is_bulk === true;
      let extras_to_use = extras;
      if (is_bulk && extras.length > 0) {
        issues.push({ code: "BULK_HAS_EXTRAS", message: "Oferta BULK no debería tener extras. Se ignorarán en el costeo." });
        extras_to_use = [];
      }
      if (mode === "CONTENT_ONLY") {
        extras_to_use = [];
      }

      // Costeo del contenido:
      let costo_contenido_ars: number | null = 0;
      const contenidoDetalle: any[] = [];

      if (contenido_real_g === null) {
        costo_contenido_ars = null;
      } else if (base) {
        // producto base: INSUMO o ITEM
        if (base.tipo_base === "INSUMO") {
          const insumo_id = Number(base.insumo_id);
          const iRes: any = await sql.query(`SELECT * FROM app.insumo WHERE insumo_id=$1 LIMIT 1`, [insumo_id]);
          const insumo = rows(iRes)?.[0];
          const nombre = insumo?.nombre ?? `Insumo ${insumo_id}`;
          const uom = (insumo?.tipo_uom ?? "").toUpperCase();
          const dens_insumo = insumo?.densidad_g_ml === null || insumo?.densidad_g_ml === undefined ? null : Number(insumo.densidad_g_ml);

          const precio = await resolveCostoInsumo(insumo_id, issues);
          let costo: number | null = null;

          if (precio.costo_unitario_ars_por_uom !== null) {
            if (uom === "GR") {
              costo = contenido_real_g * precio.costo_unitario_ars_por_uom;
            } else if (uom === "ML") {
              if (dens_insumo === null || !Number.isFinite(dens_insumo) || dens_insumo <= 0) {
                issues.push({ code: "INSUMO_DENSITY_REQUIRED", message: `Insumo base ${insumo_id} (${nombre}): falta densidad_g_ml.`, ref: { insumo_id } });
              } else {
                const vol_ml = contenido_real_g / dens_insumo;
                costo = vol_ml * precio.costo_unitario_ars_por_uom;
              }
            } else {
              // base UN no soportada para % p/p, pero aquí sería pack
              costo = null;
              issues.push({ code: "INSUMO_PRICE_MISSING", message: `Insumo base ${insumo_id}: UOM=UN no soportado para costeo por masa.` });
            }
          }

          if (costo === null) costo_contenido_ars = null;
          else if (costo_contenido_ars !== null) costo_contenido_ars += costo;

          contenidoDetalle.push({ kind: "BASE_INSUMO", insumo_id, nombre, uom, precio, costo_ars: costo });
        } else if (base.tipo_base === "ITEM") {
          // MVP: tratamos item base como GR con preferida obligatoria guardada en base
          const item_id = Number(base.item_id);
          const pref = Number(base.presentacion_preferida);
          if (!Number.isFinite(pref) || pref <= 0) {
            issues.push({ code: "PREFERRED_PRESENTATION_REQUIRED", message: "Producto base ITEM: falta presentacion_preferida." });
            costo_contenido_ars = null;
          } else {
            const lastRes: any = await sql.query(`SELECT MAX(as_of_date) AS last_date FROM app.item_price_daily_pres WHERE item_id=$1`, [item_id]);
            const last_date = rows(lastRes)?.[0]?.last_date ?? null;
            if (!last_date) {
              issues.push({ code: "PREFERRED_PRESENTATION_NOT_FOUND_LAST_DAY", message: `Producto base ITEM ${item_id}: sin precios diarios.` });
              costo_contenido_ars = null;
            } else {
              const priceRes: any = await sql.query(
                `SELECT presentacion, price_ars FROM app.item_price_daily_pres WHERE item_id=$1 AND as_of_date=$2 AND presentacion=$3 LIMIT 1`,
                [item_id, last_date, pref]
              );
              const row = rows(priceRes)?.[0] ?? null;
              if (!row) {
                issues.push({ code: "PREFERRED_PRESENTATION_NOT_FOUND_LAST_DAY", message: `Producto base ITEM ${item_id}: no existe presentación preferida en último día.` });
                costo_contenido_ars = null;
              } else {
                const unit = Number(row.price_ars) / Number(row.presentacion);
                const costo = contenido_real_g * unit;
                if (costo_contenido_ars !== null) costo_contenido_ars += costo;
                contenidoDetalle.push({ kind: "BASE_ITEM", item_id, as_of_date: String(last_date), presentacion: pref, unit_ars_per_g: unit, costo_ars: costo });
              }
            }
          }
        }
      } else if (formula) {
        const pctLines = lineas.filter((l: any) => l.componente_tipo === "INSUMO" || l.componente_tipo === "OFERTA_BULK");
        const pctSum = pctLines.reduce((acc: number, l: any) => acc + Number(l.pct_peso ?? 0), 0);
        if (pctLines.length > 0 && Math.abs(pctSum - 100) > 0.01) {
          issues.push({ code: "PCT_NO_SUM_100", message: `Los % p/p deben sumar 100. Suma actual: ${pctSum.toFixed(6)}.` });
        }

        for (const l of pctLines) {
          const linea_id = Number(l.linea_id);
          const tipo = String(l.componente_tipo || "").toUpperCase();
          const pct = Number(l.pct_peso);
          const masa_g = contenido_real_g * (pct / 100);

          if (tipo === "INSUMO") {
            const insumo_id = Number(l.insumo_id);
            const iRes: any = await sql.query(`SELECT * FROM app.insumo WHERE insumo_id=$1 LIMIT 1`, [insumo_id]);
            const insumo = rows(iRes)?.[0];
            const nombre = insumo?.nombre ?? `Insumo ${insumo_id}`;
            const uom = (insumo?.tipo_uom ?? "").toUpperCase();
            const dens_insumo = insumo?.densidad_g_ml === null || insumo?.densidad_g_ml === undefined ? null : Number(insumo.densidad_g_ml);

            if (uom === "UN") {
              issues.push({ code: "INVALID_UOM_IN_PCT", message: `Insumo ${insumo_id} (${nombre}): UOM=UN no puede estar en % p/p.`, ref: { insumo_id, linea_id } });
            }

            const precio = await resolveCostoInsumo(insumo_id, issues);

            let costo_linea: number | null = null;
            let volumen_ml: number | null = null;

            if (precio.costo_unitario_ars_por_uom !== null) {
              if (uom === "GR") costo_linea = masa_g * precio.costo_unitario_ars_por_uom;
              if (uom === "ML") {
                if (dens_insumo === null || !Number.isFinite(dens_insumo) || dens_insumo <= 0) {
                  issues.push({ code: "INSUMO_DENSITY_REQUIRED", message: `Insumo ${insumo_id} (${nombre}): falta densidad_g_ml.`, ref: { insumo_id, linea_id } });
                } else {
                  volumen_ml = masa_g / dens_insumo;
                  costo_linea = volumen_ml * precio.costo_unitario_ars_por_uom;
                }
              }
            }

            if (costo_linea === null) costo_contenido_ars = null;
            else if (costo_contenido_ars !== null) costo_contenido_ars += costo_linea;

            contenidoDetalle.push({
              kind: "LINEA_INSUMO",
              linea_id,
              insumo_id,
              nombre,
              uom,
              pct_peso: pct,
              masa_g,
              volumen_ml,
              precio,
              costo_ars: costo_linea,
            });
          }

          if (tipo === "OFERTA_BULK") {
            const oferta_bulk_id = Number(l.oferta_bulk_id);
            const o2Res: any = await sql.query(
              `SELECT o.oferta_id, o.nombre, o.producto_id, o.is_bulk, o.peso_neto_g, o.volumen_neto_ml, o.unidades_pack
               FROM app.producto_oferta o WHERE o.oferta_id=$1 LIMIT 1`,
              [oferta_bulk_id]
            );
            const o2 = rows(o2Res)?.[0];
            if (!o2) {
              issues.push({ code: "INSUMO_PRICE_MISSING", message: `Oferta BULK ${oferta_bulk_id} no encontrada.`, ref: { linea_id, oferta_bulk_id } });
              costo_contenido_ars = null;
              continue;
            }
            if (o2.is_bulk !== true) {
              issues.push({ code: "INSUMO_PRICE_MISSING", message: `La oferta ${oferta_bulk_id} no es BULK.`, ref: { linea_id, oferta_bulk_id } });
              costo_contenido_ars = null;
              continue;
            }
            if (o2.unidades_pack !== null && o2.unidades_pack !== undefined) {
              issues.push({ code: "BULK_COMPONENT_UOM_MISMATCH", message: `Oferta BULK ${oferta_bulk_id} no puede ser UN.`, ref: { linea_id, oferta_bulk_id } });
              costo_contenido_ars = null;
              continue;
            }

            const bulkCosteo = await costearOferta(oferta_bulk_id, "CONTENT_ONLY");

            const bulkStatus = bulkCosteo?.status ?? "INCOMPLETO";
            const bulkUnit = bulkCosteo?.totals?.costo_por_g_ars ?? null;

            if (bulkStatus !== "OK" || bulkUnit === null) {
              issues.push({ code: "INSUMO_PRICE_MISSING", message: `Costo BULK incompleto para oferta ${oferta_bulk_id}.`, ref: { linea_id, oferta_bulk_id } });
              costo_contenido_ars = null;
              contenidoDetalle.push({ kind: "LINEA_BULK", linea_id, oferta_bulk_id, pct_peso: pct, masa_g, unit_ars_per_g: null, costo_ars: null });
              continue;
            }

            const costo_linea = masa_g * Number(bulkUnit);
            if (costo_contenido_ars !== null) costo_contenido_ars += costo_linea;

            contenidoDetalle.push({
              kind: "LINEA_BULK",
              linea_id,
              oferta_bulk_id,
              oferta_nombre: o2.nombre,
              pct_peso: pct,
              masa_g,
              unit_ars_per_g: bulkUnit,
              costo_ars: costo_linea,
              bulk_ref: debug ? bulkCosteo : undefined,
            });
          }
        }
      } else {
        issues.push({ code: "INSUMO_PRICE_MISSING", message: "Producto sin base ni fórmula." });
        costo_contenido_ars = null;
      }

      // Extras (si corresponde)
      let costo_extras_ars: number | null = 0;
      const extrasDetalle: any[] = [];

      for (const ex of extras_to_use) {
        const tipo = String(ex.tipo || "").toUpperCase();
        let costo_extra: number | null = null;

        if (tipo === "MANUAL") {
          const c = Number(ex.costo_ars);
          if (!Number.isFinite(c) || c < 0) {
            issues.push({ code: "INSUMO_PRICE_MISSING", message: `Extra manual ${ex.extra_id}: costo inválido.` });
          } else {
            costo_extra = c;
          }
        } else {
          const insumo_id = Number(ex.insumo_id);
          const cantidad = Number(ex.cantidad);
          if (!Number.isFinite(insumo_id) || insumo_id <= 0 || !Number.isFinite(cantidad) || cantidad < 0) {
            issues.push({ code: "INSUMO_PRICE_MISSING", message: `Extra ${ex.extra_id}: insumo/cantidad inválidos.` });
          } else {
            const precio = await resolveCostoInsumo(insumo_id, issues);
            if (precio.costo_unitario_ars_por_uom !== null) {
              costo_extra = cantidad * precio.costo_unitario_ars_por_uom;
              extrasDetalle.push({ extra_id: ex.extra_id, tipo, insumo_id, cantidad, precio, costo_ars: costo_extra });
            }
          }
        }

        if (costo_extra === null) costo_extras_ars = null;
        else if (costo_extras_ars !== null) costo_extras_ars += costo_extra;

        if (tipo === "MANUAL") extrasDetalle.push({ extra_id: ex.extra_id, tipo, concepto: ex.concepto, costo_ars: costo_extra });
      }

      let costo_total_ars: number | null = null;
      if (costo_contenido_ars !== null && costo_extras_ars !== null) costo_total_ars = costo_contenido_ars + costo_extras_ars;

      const status = issues.length ? "INCOMPLETO" : "OK";

      let costo_por_g_ars: number | null = null;
      let costo_por_kg_ars: number | null = null;
      let costo_por_ml_ars: number | null = null;

      if (status === "OK" && costo_total_ars !== null && contenido_obj_g !== null && contenido_obj_g > 0) {
        costo_por_g_ars = costo_total_ars / contenido_obj_g;
        costo_por_kg_ars = costo_por_g_ars * 1000;
        if (dens_formula !== null && Number.isFinite(Number(dens_formula)) && Number(dens_formula) > 0) {
          costo_por_ml_ars = costo_por_g_ars * Number(dens_formula);
        }
      }

      const out = {
        ok: true,
        status,
        oferta_id: ofertaId,
        producto_id,
        oferta_nombre: oferta.nombre,
        producto_nombre: producto?.nombre ?? null,
        presentacion: {
          is_bulk,
          peso_neto_g: peso_neto_g ? Number(peso_neto_g) : null,
          volumen_neto_ml: volumen_neto_ml ? Number(volumen_neto_ml) : null,
          unidades_pack: unidades_pack ? Number(unidades_pack) : null,
          densidad_usada_g_ml:
            dens_formula !== null && Number.isFinite(Number(dens_formula)) && Number(dens_formula) > 0 ? Number(dens_formula) : null,
          merma_pct: merma_pct !== null && merma_pct !== undefined ? Number(merma_pct) : null,
          contenido_objetivo_g: contenido_obj_g,
          contenido_real_g,
        },
        totals: {
          costo_contenido_ars,
          costo_extras_ars,
          costo_total_ars,
          costo_por_g_ars,
          costo_por_kg_ars,
          costo_por_ml_ars,
        },
        issues,
        contenido: contenidoDetalle,
        extras: extrasDetalle,
        meta: { computed_at: new Date().toISOString(), mode },
      };

      memo.set(ofertaId, out);
      stack.delete(ofertaId);
      return out;
    }

    const dto = await costearOferta(oferta_id, "FULL");
    if (!debug) {
      // remove deep refs if any
      // (kept minimal)
    }
    return NextResponse.json(dto);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
