import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../../lib/db";

function normalizeQueryResult(res: any): any[] {
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
  | "VARIANT_PRESENTATION_INCOMPLETE"
  | "PRODUCT_CONTENT_NOT_DEFINED";

type Issue = {
  code: IssueCode;
  message: string;
  ref?: { producto_id?: number; insumo_id?: number; item_id?: number; fuente_id?: number; linea_id?: number; extra_id?: number; oferta_id?: number };
};

type PrecioResolved = {
  policy: "PREFERRED_REQUIRED";
  fuente_tipo: "ITEM" | "MANUAL";
  fuente_id: number;
  selected_reason: "MANUAL" | "PREFERRED_PRESENTATION";
  item_id?: number;
  as_of_date?: string;
  presentacion?: number;
  price_ars?: number;
  costo_unitario_ars_por_uom: number | null;
};

function isFinitePos(n: any) {
  const x = Number(n);
  return Number.isFinite(x) && x > 0;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ oferta_id: string }> }) {
  try {
    const { oferta_id: oferta_idStr } = await ctx.params;

    const sql = db();
    const oferta_id = Number(oferta_idStr);
    if (!Number.isFinite(oferta_id)) return NextResponse.json({ ok: false, error: "oferta_id inválido" }, { status: 400 });

    const debug = new URL(req.url).searchParams.get("debug") === "true";

    // Oferta
    const oRes: any = await sql.query(
      `SELECT * FROM app.producto_oferta WHERE oferta_id=$1 LIMIT 1`,
      [oferta_id]
    );
    const oferta = normalizeQueryResult(oRes)?.[0];
    if (!oferta) return NextResponse.json({ ok: false, error: "oferta no encontrada" }, { status: 404 });

    // Producto
    const pRes: any = await sql.query(
      `SELECT * FROM app.producto WHERE producto_id=$1 LIMIT 1`,
      [oferta.producto_id]
    );
    const producto = normalizeQueryResult(pRes)?.[0];
    if (!producto) return NextResponse.json({ ok: false, error: "producto no encontrado" }, { status: 404 });

    // Base y fórmula (0 o 1)
    const baseRes: any = await sql.query(
      `SELECT * FROM app.producto_base WHERE producto_id=$1 LIMIT 1`,
      [producto.producto_id]
    );
    const base = normalizeQueryResult(baseRes)?.[0] ?? null;

    const fRes: any = await sql.query(
      `SELECT * FROM app.producto_formula WHERE producto_id=$1 LIMIT 1`,
      [producto.producto_id]
    );
    const formula = normalizeQueryResult(fRes)?.[0] ?? null;

    const lineas = formula
      ? normalizeQueryResult(
          await sql.query(
            `SELECT linea_id, producto_id, insumo_id, pct_peso, orden
             FROM app.producto_formula_linea
             WHERE producto_id=$1
             ORDER BY orden ASC, linea_id ASC`,
            [producto.producto_id]
          )
        )
      : [];

    const extras = normalizeQueryResult(
      await sql.query(
        `SELECT extra_id, oferta_id, tipo, insumo_id, cantidad, concepto, costo_ars, orden
         FROM app.producto_oferta_extra
         WHERE oferta_id=$1
         ORDER BY orden ASC, extra_id ASC`,
        [oferta_id]
      )
    );

    const issues: Issue[] = [];
    const setIssue = (iss: Issue) => issues.push(iss);

    // Densidad usada (para convertir oferta por mL / volumen por unidad)
    const dens_formula = oferta.densidad_override_g_ml ?? producto.densidad_producto_g_ml ?? (formula?.densidad_formula_g_ml ?? null);

    // Resolver contenido objetivo en g
    const peso_neto_g = oferta.peso_neto_g ?? null;
    const volumen_neto_ml = oferta.volumen_neto_ml ?? null;
    const unidades_pack = oferta.unidades_pack ?? null;
    const masa_por_unidad_g = oferta.masa_por_unidad_g ?? null;
    const volumen_por_unidad_ml = oferta.volumen_por_unidad_ml ?? null;
    const merma_pct = oferta.merma_pct ?? null;

    let contenido_objetivo_g: number | null = null;
    if (isFinitePos(peso_neto_g)) {
      contenido_objetivo_g = Number(peso_neto_g);
    } else if (isFinitePos(volumen_neto_ml)) {
      if (!isFinitePos(dens_formula)) {
        setIssue({ code: "FORMULA_DENSITY_REQUIRED", message: "Falta densidad (producto/oferta) para costear por mL.", ref: { oferta_id } });
      } else {
        contenido_objetivo_g = Number(volumen_neto_ml) * Number(dens_formula);
      }
    } else if (isFinitePos(unidades_pack)) {
      if (isFinitePos(masa_por_unidad_g)) {
        contenido_objetivo_g = Number(unidades_pack) * Number(masa_por_unidad_g);
      } else if (isFinitePos(volumen_por_unidad_ml)) {
        if (!isFinitePos(dens_formula)) {
          setIssue({ code: "FORMULA_DENSITY_REQUIRED", message: "Falta densidad (producto/oferta) para UN con volumen/unidad.", ref: { oferta_id } });
        } else {
          contenido_objetivo_g = Number(unidades_pack) * Number(volumen_por_unidad_ml) * Number(dens_formula);
        }
      } else {
        setIssue({ code: "VARIANT_PRESENTATION_INCOMPLETE", message: "Para UN, definir masa_por_unidad_g o volumen_por_unidad_ml.", ref: { oferta_id } });
      }
    } else {
      setIssue({ code: "VARIANT_PRESENTATION_INCOMPLETE", message: "Definir peso_neto_g o volumen_neto_ml o unidades_pack.", ref: { oferta_id } });
    }

    let contenido_real_g: number | null = contenido_objetivo_g;
    if (contenido_objetivo_g !== null && isFinitePos(merma_pct) && Number(merma_pct) < 100) {
      contenido_real_g = contenido_objetivo_g / (1 - Number(merma_pct) / 100);
    }

    // Recolectar insumos usados (líneas fórmula + base INSUMO + extras)
    const insumoIds = new Set<number>();
    if (base?.tipo_base === 'INSUMO' && Number.isFinite(Number(base.insumo_id))) insumoIds.add(Number(base.insumo_id));
    for (const l of lineas) if (Number.isFinite(Number(l.insumo_id))) insumoIds.add(Number(l.insumo_id));
    for (const ex of extras) if (Number.isFinite(Number(ex.insumo_id))) insumoIds.add(Number(ex.insumo_id));

    const insumoIdArr = Array.from(insumoIds);
    const insumosById = new Map<number, any>();
    const fuentesByInsumo = new Map<number, any[]>();

    if (insumoIdArr.length) {
      const iRes: any = await sql.query(`SELECT * FROM app.insumo WHERE insumo_id = ANY($1::bigint[])`, [insumoIdArr]);
      for (const row of normalizeQueryResult(iRes)) insumosById.set(Number(row.insumo_id), row);

      const fuRes: any = await sql.query(
        `SELECT * FROM app.insumo_fuente
         WHERE insumo_id = ANY($1::bigint[])
           AND habilitada = true
         ORDER BY insumo_id ASC, prioridad ASC, fuente_id ASC`,
        [insumoIdArr]
      );
      for (const f of normalizeQueryResult(fuRes)) {
        const id = Number(f.insumo_id);
        if (!fuentesByInsumo.has(id)) fuentesByInsumo.set(id, []);
        fuentesByInsumo.get(id)!.push(f);
      }
    }

    async function resolveCostoInsumo(insumo_id: number): Promise<PrecioResolved> {
      const policy: "PREFERRED_REQUIRED" = "PREFERRED_REQUIRED";
      const fuentes = fuentesByInsumo.get(insumo_id) ?? [];
      const fuente = fuentes[0];

      if (!fuente) {
        setIssue({ code: "INSUMO_PRICE_MISSING", message: `Insumo ${insumo_id}: sin fuente habilitada.`, ref: { insumo_id } });
        return { policy, fuente_tipo: "MANUAL", fuente_id: -1, selected_reason: "MANUAL", costo_unitario_ars_por_uom: null };
      }

      if (fuente.tipo === "MANUAL") {
        const c = Number(fuente.costo_por_uom_ars);
        if (!Number.isFinite(c) || c < 0) {
          setIssue({ code: "INSUMO_PRICE_MISSING", message: `Insumo ${insumo_id}: costo manual inválido.`, ref: { insumo_id, fuente_id: Number(fuente.fuente_id) } });
          return { policy, fuente_tipo: "MANUAL", fuente_id: Number(fuente.fuente_id), selected_reason: "MANUAL", costo_unitario_ars_por_uom: null };
        }
        return { policy, fuente_tipo: "MANUAL", fuente_id: Number(fuente.fuente_id), selected_reason: "MANUAL", costo_unitario_ars_por_uom: c };
      }

      // ITEM
      const fuente_id = Number(fuente.fuente_id);
      const item_id = Number(fuente.item_id);
      const prefRaw = fuente.presentacion_preferida;
      const prefNum = prefRaw === null || prefRaw === undefined ? NaN : Number(prefRaw);
      if (!Number.isFinite(prefNum) || prefNum <= 0) {
        setIssue({ code: "PREFERRED_PRESENTATION_REQUIRED", message: `Insumo ${insumo_id}: falta presentacion_preferida.`, ref: { insumo_id, item_id, fuente_id } });
        return { policy, fuente_tipo: "ITEM", fuente_id, selected_reason: "PREFERRED_PRESENTATION", item_id, costo_unitario_ars_por_uom: null };
      }

      const lastRes: any = await sql.query(`SELECT MAX(as_of_date) AS last_date FROM app.item_price_daily_pres WHERE item_id=$1`, [item_id]);
      const last_date = normalizeQueryResult(lastRes)?.[0]?.last_date ?? null;
      if (!last_date) {
        setIssue({ code: "PREFERRED_PRESENTATION_NOT_FOUND_LAST_DAY", message: `Insumo ${insumo_id}: item ${item_id} sin precios diarios.`, ref: { insumo_id, item_id, fuente_id } });
        return { policy, fuente_tipo: "ITEM", fuente_id, selected_reason: "PREFERRED_PRESENTATION", item_id, costo_unitario_ars_por_uom: null };
      }

      const priceRes: any = await sql.query(
        `SELECT item_id, as_of_date, presentacion, price_ars
         FROM app.item_price_daily_pres
         WHERE item_id=$1 AND as_of_date=$2 AND presentacion=$3
         LIMIT 1`,
        [item_id, last_date, prefNum]
      );
      const row = normalizeQueryResult(priceRes)?.[0] ?? null;
      if (!row) {
        setIssue({
          code: "PREFERRED_PRESENTATION_NOT_FOUND_LAST_DAY",
          message: `Insumo ${insumo_id}: preferida=${prefNum} no existe en último día (${String(last_date)}).`,
          ref: { insumo_id, item_id, fuente_id },
        });
        return { policy, fuente_tipo: "ITEM", fuente_id, selected_reason: "PREFERRED_PRESENTATION", item_id, as_of_date: String(last_date), presentacion: prefNum, costo_unitario_ars_por_uom: null };
      }

      const price_ars = Number(row.price_ars);
      const presentacion = Number(row.presentacion);
      if (!Number.isFinite(price_ars) || !Number.isFinite(presentacion) || presentacion <= 0) {
        setIssue({ code: "INSUMO_PRICE_MISSING", message: `Insumo ${insumo_id}: precio/presentación inválidos.`, ref: { insumo_id, item_id, fuente_id } });
        return { policy, fuente_tipo: "ITEM", fuente_id, selected_reason: "PREFERRED_PRESENTATION", item_id, as_of_date: String(last_date), presentacion, price_ars, costo_unitario_ars_por_uom: null };
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

    // Resolver costo unitario de base ITEM (preferida obligatoria), asumiendo UOM=GR
    async function resolveCostoItemPreferido(item_id: number, presentacion_preferida: number): Promise<PrecioResolved> {
      const policy: "PREFERRED_REQUIRED" = "PREFERRED_REQUIRED";

      if (!isFinitePos(presentacion_preferida)) {
        setIssue({ code: "PREFERRED_PRESENTATION_REQUIRED", message: `Producto base ITEM: falta presentacion_preferida.`, ref: { item_id, producto_id: Number(producto.producto_id) } });
        return { policy, fuente_tipo: "ITEM", fuente_id: -1, selected_reason: "PREFERRED_PRESENTATION", item_id, costo_unitario_ars_por_uom: null };
      }

      const lastRes: any = await sql.query(`SELECT MAX(as_of_date) AS last_date FROM app.item_price_daily_pres WHERE item_id=$1`, [item_id]);
      const last_date = normalizeQueryResult(lastRes)?.[0]?.last_date ?? null;
      if (!last_date) {
        setIssue({ code: "PREFERRED_PRESENTATION_NOT_FOUND_LAST_DAY", message: `Producto base ITEM: item ${item_id} sin precios diarios.`, ref: { item_id } });
        return { policy, fuente_tipo: "ITEM", fuente_id: -1, selected_reason: "PREFERRED_PRESENTATION", item_id, costo_unitario_ars_por_uom: null };
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
        setIssue({
          code: "PREFERRED_PRESENTATION_NOT_FOUND_LAST_DAY",
          message: `Producto base ITEM: preferida=${presentacion_preferida} no existe en último día (${String(last_date)}).`,
          ref: { item_id },
        });
        return { policy, fuente_tipo: "ITEM", fuente_id: -1, selected_reason: "PREFERRED_PRESENTATION", item_id, as_of_date: String(last_date), presentacion: presentacion_preferida, costo_unitario_ars_por_uom: null };
      }

      const price_ars = Number(row.price_ars);
      const presentacion = Number(row.presentacion);
      if (!Number.isFinite(price_ars) || !Number.isFinite(presentacion) || presentacion <= 0) {
        setIssue({ code: "INSUMO_PRICE_MISSING", message: `Producto base ITEM: precio/presentación inválidos.`, ref: { item_id } });
        return { policy, fuente_tipo: "ITEM", fuente_id: -1, selected_reason: "PREFERRED_PRESENTATION", item_id, as_of_date: String(last_date), presentacion, price_ars, costo_unitario_ars_por_uom: null };
      }

      return {
        policy,
        fuente_tipo: "ITEM",
        fuente_id: -1,
        selected_reason: "PREFERRED_PRESENTATION",
        item_id,
        as_of_date: String(last_date),
        presentacion,
        price_ars,
        costo_unitario_ars_por_uom: price_ars / presentacion,
      };
    }

    // Contenido (desglose)
    const contenidoOut: any[] = [];
    let costo_contenido_ars: number | null = 0;

    if (contenido_real_g === null) {
      // sin contenido no se puede costear
      costo_contenido_ars = null;
    } else if (formula) {
      // Validar sumatoria %
      const pctSum = lineas.reduce((acc: number, l: any) => acc + Number(l.pct_peso ?? 0), 0);
      const tol = 0.01;
      if (lineas.length > 0 && Math.abs(pctSum - 100) > tol) {
        setIssue({ code: "PCT_NO_SUM_100", message: `Los % p/p deben sumar 100. Suma actual: ${pctSum.toFixed(6)}.`, ref: { producto_id: Number(producto.producto_id) } });
      }

      for (const l of lineas) {
        const linea_id = Number(l.linea_id);
        const insumo_id = Number(l.insumo_id);
        const pct_peso = Number(l.pct_peso);
        const insumo = insumosById.get(insumo_id);
        const nombre = insumo?.nombre ?? `Insumo ${insumo_id}`;
        const tipo_uom = String(insumo?.tipo_uom ?? "").toUpperCase();

        if (tipo_uom === "UN") {
          setIssue({ code: "INVALID_UOM_IN_PCT", message: `Insumo ${insumo_id} (${nombre}): UOM=UN no puede estar en % p/p.`, ref: { insumo_id, linea_id } });
        }

        const masa_g = contenido_real_g * (pct_peso / 100);
        const dens_insumo =
          insumo?.densidad_g_ml === null || insumo?.densidad_g_ml === undefined
            ? null
            : Number(insumo.densidad_g_ml);
        let volumen_ml: number | null = null;
        if (tipo_uom === "ML") {
          if (dens_insumo === null || !Number.isFinite(dens_insumo) || dens_insumo <= 0) {
            setIssue({ code: "INSUMO_DENSITY_REQUIRED", message: `Insumo ${insumo_id} (${nombre}): falta densidad_g_ml.`, ref: { insumo_id, linea_id } });
          } else {
            const dens = dens_insumo; // ya es number por el if anterior
            volumen_ml = masa_g / dens;
          }
        }

        const precio = await resolveCostoInsumo(insumo_id);
        let costo_linea_ars: number | null = null;
        if (precio.costo_unitario_ars_por_uom !== null) {
          if (tipo_uom === "GR") costo_linea_ars = masa_g * precio.costo_unitario_ars_por_uom;
          if (tipo_uom === "ML" && volumen_ml !== null) costo_linea_ars = volumen_ml * precio.costo_unitario_ars_por_uom;
        }

        if (costo_linea_ars === null) costo_contenido_ars = null;
        if (costo_contenido_ars !== null && costo_linea_ars !== null) costo_contenido_ars += costo_linea_ars;

        contenidoOut.push({ linea_id, insumo_id, nombre, tipo_uom_insumo: tipo_uom, pct_peso, masa_g, densidad_insumo_g_ml: dens_insumo, volumen_ml, precio, costo_linea_ars });
      }
    } else if (base) {
      // Producto simple
      if (base.tipo_base === 'INSUMO') {
        const insumo_id = Number(base.insumo_id);
        const insumo = insumosById.get(insumo_id);
        const nombre = insumo?.nombre ?? `Insumo ${insumo_id}`;
        const tipo_uom = String(insumo?.tipo_uom ?? "").toUpperCase();
        const masa_g = contenido_real_g;
        const dens_insumo = insumo?.densidad_g_ml === null || insumo?.densidad_g_ml === undefined ? null : Number(insumo.densidad_g_ml);
        let volumen_ml: number | null = null;
        if (tipo_uom === 'ML') {
          if (!isFinitePos(dens_insumo)) {
            setIssue({ code: "INSUMO_DENSITY_REQUIRED", message: `Insumo base ${insumo_id} (${nombre}): falta densidad_g_ml.`, ref: { insumo_id } });
          } else {
            volumen_ml = masa_g / dens_insumo;
          }
        }
        const precio = await resolveCostoInsumo(insumo_id);
        let costo_linea_ars: number | null = null;
        if (precio.costo_unitario_ars_por_uom !== null) {
          if (tipo_uom === 'GR') costo_linea_ars = masa_g * precio.costo_unitario_ars_por_uom;
          if (tipo_uom === 'ML' && volumen_ml !== null) costo_linea_ars = volumen_ml * precio.costo_unitario_ars_por_uom;
        }
        costo_contenido_ars = costo_linea_ars;
        contenidoOut.push({ linea_id: null, insumo_id, nombre, tipo_uom_insumo: tipo_uom, pct_peso: 100, masa_g, densidad_insumo_g_ml: dens_insumo, volumen_ml, precio, costo_linea_ars });
      } else {
        // ITEM directo (asumimos presentacion en GR)
        const item_id = Number(base.item_id);
        const pref = Number(base.presentacion_preferida);
        const precio = await resolveCostoItemPreferido(item_id, pref);
        let costo_linea_ars: number | null = null;
        if (precio.costo_unitario_ars_por_uom !== null) {
          costo_linea_ars = contenido_real_g * precio.costo_unitario_ars_por_uom;
        }
        costo_contenido_ars = costo_linea_ars;
        contenidoOut.push({ linea_id: null, insumo_id: null, nombre: `Item ${item_id}`, tipo_uom_insumo: 'GR', pct_peso: 100, masa_g: contenido_real_g, densidad_insumo_g_ml: null, volumen_ml: null, precio, costo_linea_ars });
      }
    } else {
      setIssue({ code: "PRODUCT_CONTENT_NOT_DEFINED", message: "Producto sin base ni fórmula.", ref: { producto_id: Number(producto.producto_id) } });
      costo_contenido_ars = null;
    }

    // Extras
    const extrasOut: any[] = [];
    let costo_extras_ars: number | null = 0;

    for (const ex of extras) {
      const extra_id = Number(ex.extra_id);
      const tipo = String(ex.tipo || "").toUpperCase();
      const insumo_id = ex.insumo_id === null || ex.insumo_id === undefined ? null : Number(ex.insumo_id);
      const cantidad = ex.cantidad === null || ex.cantidad === undefined ? null : Number(ex.cantidad);
      const concepto = typeof ex.concepto === "string" ? ex.concepto : null;
      const costo_manual = ex.costo_ars === null || ex.costo_ars === undefined ? null : Number(ex.costo_ars);

      let costo_extra_ars: number | null = null;
      let precio: PrecioResolved | undefined = undefined;

      if (tipo === "MANUAL") {
        if (Number.isFinite(costo_manual) && costo_manual! >= 0) costo_extra_ars = costo_manual!;
        else setIssue({ code: "INSUMO_PRICE_MISSING", message: `Extra manual ${extra_id}: costo_ars inválido.`, ref: { extra_id } });
      } else {
        if (!insumo_id || !Number.isFinite(insumo_id)) {
          setIssue({ code: "INSUMO_PRICE_MISSING", message: `Extra ${extra_id}: falta insumo_id.`, ref: { extra_id } });
        } else if (cantidad === null || !Number.isFinite(cantidad) || Number(cantidad) < 0) {
          setIssue({ code: "INSUMO_PRICE_MISSING", message: `Extra ${extra_id}: cantidad inválida.`, ref: { extra_id, insumo_id } });
        } else {
          precio = await resolveCostoInsumo(insumo_id);
          if (precio.costo_unitario_ars_por_uom !== null) costo_extra_ars = Number(cantidad) * precio.costo_unitario_ars_por_uom;
        }
      }

      if (costo_extra_ars === null) costo_extras_ars = null;
      if (costo_extras_ars !== null && costo_extra_ars !== null) costo_extras_ars += costo_extra_ars;

      extrasOut.push({ extra_id, tipo, insumo_id, concepto, cantidad, precio, costo_extra_ars });
    }

    let costo_total_ars: number | null = null;
    if (costo_contenido_ars !== null && costo_extras_ars !== null) costo_total_ars = costo_contenido_ars + costo_extras_ars;

    const status = issues.length ? "INCOMPLETO" : "OK";

    let costo_por_g_ars: number | null = null;
    let costo_por_kg_ars: number | null = null;
    let costo_por_ml_ars: number | null = null;

    if (status === "OK" && costo_total_ars !== null && contenido_objetivo_g !== null && contenido_objetivo_g > 0) {
      costo_por_g_ars = costo_total_ars / contenido_objetivo_g;
      costo_por_kg_ars = costo_por_g_ars * 1000;
      if (isFinitePos(dens_formula)) costo_por_ml_ars = costo_por_g_ars * Number(dens_formula);
    }

    return NextResponse.json({
      ok: true,
      status,
      oferta_id,
      producto_id: Number(producto.producto_id),
      presentacion: {
        peso_neto_g: isFinitePos(peso_neto_g) ? Number(peso_neto_g) : null,
        volumen_neto_ml: isFinitePos(volumen_neto_ml) ? Number(volumen_neto_ml) : null,
        unidades_pack: isFinitePos(unidades_pack) ? Number(unidades_pack) : null,
        masa_por_unidad_g: isFinitePos(masa_por_unidad_g) ? Number(masa_por_unidad_g) : null,
        volumen_por_unidad_ml: isFinitePos(volumen_por_unidad_ml) ? Number(volumen_por_unidad_ml) : null,
        densidad_producto_g_ml_usada: isFinitePos(dens_formula) ? Number(dens_formula) : null,
        merma_pct: merma_pct !== null && merma_pct !== undefined ? Number(merma_pct) : null,
        contenido_objetivo_g,
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
      contenido: contenidoOut,
      extras: extrasOut,
      meta: {
        computed_at: new Date().toISOString(),
        ...(debug ? { base, formula: !!formula, lineas_count: lineas.length } : {}),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
