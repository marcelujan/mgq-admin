"use client";

import { useEffect, useMemo, useState } from "react";

type Producto = {
  producto_id: number;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  densidad_producto_g_ml: number | null;
  activo: boolean;
};

type Oferta = {
  oferta_id: number;
  producto_id: number;
  nombre: string;
  activo: boolean;
  is_bulk: boolean;
  peso_neto_g: number | null;
  volumen_neto_ml: number | null;
  unidades_pack: number | null;
  masa_por_unidad_g: number | null;
  volumen_por_unidad_ml: number | null;
  densidad_override_g_ml: number | null;
};

type FormulaV2 = {
  producto_id: number;
  lote_ref_g: number;
  updated_at: string;
} | null;

type CostosProduccion = {
  producto_id: number;
  lote_ref_kg: number | null;
  costo_fijo_por_lote_ars: number | null;
  costo_variable_por_kg_ars: number | null;
  updated_at: string;
} | null;

type ItemOption = {
  tipo: "ITEM_PRESENTACION";
  item_id: number;
  presentacion: number;
  price_ars: number;
  as_of_date: string;
  proveedor_codigo: string;
  proveedor_nombre: string;
  url_original: string;
  url_canonica: string;
};

type CostOptionExtra = {
  cost_option_id: number;
  tipo: "MANUAL_PRESENTACION" | "BULK_PRODUCTO" | "ITEM_PRESENTACION";
  item_id: number | null;
  item_presentacion: number | null;

  manual_nombre: string | null;
  manual_uom: "GR" | "ML" | "UN" | null;
  manual_cantidad: number | null;
  manual_costo_ars: number | null;

  bulk_producto_id: number | null;

  densidad_g_ml: number | null;
  activo: boolean;
};

type LineaV2 = {
  linea_id: number;
  producto_id: number;
  cost_option_id: number;
  pct_peso: number | null;
  is_csp: boolean;
  orden: number;

  tipo: "ITEM_PRESENTACION" | "MANUAL_PRESENTACION" | "BULK_PRODUCTO";
  item_id: number | null;
  item_presentacion: number | null;

  job_price_ars: number | null;
  job_as_of_date: string | null;

  manual_nombre: string | null;
  manual_uom: "GR" | "ML" | "UN" | null;
  manual_cantidad: number | null;
  manual_costo_ars: number | null;

  bulk_producto_id: number | null;

  densidad_g_ml: number | null;
};

type BulkRow = {
  producto_id: number;
  nombre: string;
  densidad_producto_g_ml: number | null;
  ars_por_kg: number | null;
};

type PackagingItem = {
  packaging_item_id: number;
  nombre: string;
  descripcion: string | null;
  unidad: string; // en este MVP: "UN"
  costo_unitario_ars: number;
  activo: boolean;
};

type OfertaPackagingRow = {
  oferta_packaging_id: number;
  oferta_id: number;
  packaging_item_id: number;
  cantidad: number;
  costo_unitario_override_ars: number | null;

  // join
  nombre: string;
  unidad: string; // "UN"
  costo_unitario_ars: number;
};

function numOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function fmtMaybe(v: any, dec: number): string {
  const n = numOrNull(v);
  return n === null ? "-" : n.toFixed(dec);
}

function parseBlurNumber(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function ProductoClient({ productoId }: { productoId: number }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [producto, setProducto] = useState<Producto | null>(null);
  const [ofertas, setOfertas] = useState<Oferta[]>([]);

  const [formulaV2, setFormulaV2] = useState<FormulaV2>(null);
  const [costosProd, setCostosProd] = useState<CostosProduccion>(null);
  const [lineasV2, setLineasV2] = useState<LineaV2[]>([]);

  const [itemOptions, setItemOptions] = useState<ItemOption[]>([]);
  const [extraOptions, setExtraOptions] = useState<CostOptionExtra[]>([]);

  const [searchOpt, setSearchOpt] = useState("");
  const [soloSel, setSoloSel] = useState(true);

  const [bulkCostByProducto, setBulkCostByProducto] = useState<Record<number, number>>({});
  const [bulkSelf, setBulkSelf] = useState<{ ars_por_kg: number | null } | null>(null);

  // Selector de bulks
  const [bulkSearch, setBulkSearch] = useState("");
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Manuales
  const [manualSearch, setManualSearch] = useState("");
  const [manualNombre, setManualNombre] = useState("");
  const [manualUom, setManualUom] = useState<"GR" | "ML" | "UN">("GR");
  const [manualCantidad, setManualCantidad] = useState<string>("");
  const [manualCostoARS, setManualCostoARS] = useState<string>("");
  const [manualDens, setManualDens] = useState<string>("");

  // Packaging
  const [packagingItems, setPackagingItems] = useState<PackagingItem[]>([]);
  const [packagingByOferta, setPackagingByOferta] = useState<Record<number, OfertaPackagingRow[]>>({});
  const [ofertaOpen, setOfertaOpen] = useState<Record<number, boolean>>({});
  const [addPackItemByOferta, setAddPackItemByOferta] = useState<
    Record<number, { packaging_item_id: string; cantidad: string }>
  >({});

  // Alta rápida catálogo packaging
  const [newPackNombre, setNewPackNombre] = useState("");
  const [newPackCosto, setNewPackCosto] = useState("");

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [pR, oR, fR, lR, optR] = await Promise.all([
        fetch(`/api/productos/${productoId}`, { cache: "no-store" }),
        fetch(`/api/productos/${productoId}/ofertas`, { cache: "no-store" }),
        fetch(`/api/productos/${productoId}/formula-v2`, { cache: "no-store" }),
        fetch(`/api/productos/${productoId}/formula-v2/lineas`, { cache: "no-store" }),
        fetch(
          `/api/cost-options?limit=400&solo_seleccionados=${soloSel ? "true" : "false"}&search=${encodeURIComponent(
            searchOpt
          )}`,
          { cache: "no-store" }
        ),
      ]);

      const pJ = await pR.json();
      if (!pR.ok || !pJ?.ok) throw new Error(pJ?.error || `HTTP ${pR.status}`);
      const p = pJ.producto as any;
      if (p && "densidad_producto_g_ml" in p) p.densidad_producto_g_ml = numOrNull(p.densidad_producto_g_ml);
      setProducto(p);

      const oJ = await oR.json();
      if (!oR.ok || !oJ?.ok) throw new Error(oJ?.error || `HTTP ${oR.status}`);
      const ofertasList = (oJ.ofertas || []) as Oferta[];
      setOfertas(ofertasList);

      const fJ = await fR.json();
      if (!fR.ok || !fJ?.ok) throw new Error(fJ?.error || `HTTP ${fR.status}`);
      setFormulaV2(fJ.formula);
      setCostosProd(fJ.costos_produccion);

      const lJ = await lR.json();
      if (!lR.ok || !lJ?.ok) throw new Error(lJ?.error || `HTTP ${lR.status}`);
      const lineas = (lJ.lineas || []) as any[];
      for (const l of lineas) {
        l.pct_peso = numOrNull(l.pct_peso);
        l.densidad_g_ml = numOrNull(l.densidad_g_ml);
        l.job_price_ars = numOrNull(l.job_price_ars);
        l.manual_cantidad = numOrNull(l.manual_cantidad);
        l.manual_costo_ars = numOrNull(l.manual_costo_ars);
      }
      setLineasV2(lineas as LineaV2[]);

      const optJ = await optR.json();
      if (!optR.ok || !optJ?.ok) throw new Error(optJ?.error || `HTTP ${optR.status}`);

      const items = (optJ.item_options || []) as any[];
      for (const it of items) {
        it.presentacion = Number(it.presentacion);
        it.price_ars = Number(it.price_ars);
      }
      setItemOptions(items as ItemOption[]);

      const extras = (optJ.cost_options_extra || []) as any[];
      for (const e of extras) {
        e.cost_option_id = Number(e.cost_option_id);
        e.item_presentacion = numOrNull(e.item_presentacion);
        e.manual_cantidad = numOrNull(e.manual_cantidad);
        e.manual_costo_ars = numOrNull(e.manual_costo_ars);
        e.densidad_g_ml = numOrNull(e.densidad_g_ml);
        e.bulk_producto_id = numOrNull(e.bulk_producto_id);
      }
      setExtraOptions(extras as CostOptionExtra[]);

      // Bulk del producto actual (info)
      try {
        const r = await fetch(`/api/productos/${productoId}/costo-bulk`, { cache: "no-store" });
        const j = await r.json().catch(() => ({} as any));
        if (r.ok && j?.ok) {
          setBulkSelf({ ars_por_kg: numOrNull(j.ars_por_kg) });
        } else {
          setBulkSelf({ ars_por_kg: null });
        }
      } catch {
        setBulkSelf({ ars_por_kg: null });
      }

      // Prefetch bulks usados en fórmula
      const bulkIds = Array.from(
        new Set(
          (lineas as LineaV2[])
            .filter((x) => x.tipo === "BULK_PRODUCTO" && x.bulk_producto_id)
            .map((x) => Number(x.bulk_producto_id))
            .filter((x) => Number.isFinite(x))
        )
      );

      if (bulkIds.length) {
        const results = await Promise.all(
          bulkIds.map(async (id) => {
            const r = await fetch(`/api/productos/${id}/costo-bulk`, { cache: "no-store" });
            const j = await r.json().catch(() => ({} as any));
            if (!r.ok || !j?.ok) throw new Error(j?.error || `bulk ${id}: HTTP ${r.status}`);
            return [id, numOrNull(j.ars_por_kg)] as const;
          })
        );

        const next: Record<number, number> = {};
        for (const [id, arsKg] of results) if (arsKg !== null) next[id] = arsKg;
        setBulkCostByProducto(next);
      } else {
        setBulkCostByProducto({});
      }

      // Packaging (catálogo + relaciones por oferta)
      try {
        await loadPackagingItems();
        await loadPackagingAll(ofertasList);
      } catch (e: any) {
        // no bloquear editor si packaging falla
        console.error(e);
      }
    } catch (e: any) {
      setError(e?.message || "error");
    } finally {
      setLoading(false);
    }
  }

  async function loadBulks() {
    setBulkLoading(true);
    try {
      const r = await fetch(`/api/productos/bulks?limit=50&offset=0&search=${encodeURIComponent(bulkSearch)}`, {
        cache: "no-store",
      });
      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);

      const rows = (j.rows || []) as any[];
      for (const b of rows) {
        b.producto_id = Number(b.producto_id);
        b.densidad_producto_g_ml = numOrNull(b.densidad_producto_g_ml);
        b.ars_por_kg = numOrNull(b.ars_por_kg);
      }
      setBulkRows(rows as BulkRow[]);
    } catch (e: any) {
      setError(e?.message || "error");
    } finally {
      setBulkLoading(false);
    }
  }

  async function loadPackagingItems() {
    const r = await fetch(`/api/packaging-items`, { cache: "no-store" });
    const j = await r.json().catch(() => ({} as any));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);

    const rows = (j.items || []) as any[];
    for (const it of rows) {
      it.packaging_item_id = Number(it.packaging_item_id);
      it.costo_unitario_ars = Number(it.costo_unitario_ars);
      it.activo = !!it.activo;
      // MVP: el backend debería devolver unidad="UN"; si no, forzamos visualmente a UN sin romper.
      if (!it.unidad) it.unidad = "UN";
    }
    setPackagingItems(rows as PackagingItem[]);
  }

  async function loadPackagingForOferta(oferta_id: number) {
    const r = await fetch(`/api/productos/ofertas/${oferta_id}/packaging`, { cache: "no-store" });
    const j = await r.json().catch(() => ({} as any));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);

    const rows = (j.rows || []) as any[];
    for (const x of rows) {
      x.oferta_packaging_id = Number(x.oferta_packaging_id);
      x.oferta_id = Number(x.oferta_id);
      x.packaging_item_id = Number(x.packaging_item_id);
      x.cantidad = Number(x.cantidad);
      x.costo_unitario_override_ars = numOrNull(x.costo_unitario_override_ars);
      x.costo_unitario_ars = Number(x.costo_unitario_ars);
      if (!x.unidad) x.unidad = "UN";
    }

    setPackagingByOferta((prev) => ({ ...prev, [oferta_id]: rows as OfertaPackagingRow[] }));
  }

  async function loadPackagingAll(ofertasList: Oferta[]) {
    await Promise.all(ofertasList.map((o) => loadPackagingForOferta(o.oferta_id)));
  }

  async function createPackagingItem(payload: { nombre: string; unidad: string; costo_unitario_ars: number }) {
    const r = await fetch(`/api/packaging-items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({} as any));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    await loadPackagingItems();
    return j.packaging_item_id as number;
  }

  async function addOfertaPackaging(oferta_id: number, payload: { packaging_item_id: number; cantidad: number }) {
    const r = await fetch(`/api/productos/ofertas/${oferta_id}/packaging`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({} as any));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    await loadPackagingForOferta(oferta_id);
  }

  async function patchOfertaPackaging(oferta_id: number, oferta_packaging_id: number, patch: any) {
    const r = await fetch(`/api/productos/ofertas/${oferta_id}/packaging/${oferta_packaging_id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const j = await r.json().catch(() => ({} as any));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    await loadPackagingForOferta(oferta_id);
  }

  async function deleteOfertaPackaging(oferta_id: number, oferta_packaging_id: number) {
    const r = await fetch(`/api/productos/ofertas/${oferta_id}/packaging/${oferta_packaging_id}`, {
      method: "DELETE",
    });
    const j = await r.json().catch(() => ({} as any));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    await loadPackagingForOferta(oferta_id);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loteRefG = numOrNull(formulaV2?.lote_ref_g) ?? 1000;

  const cspLinea = useMemo(() => lineasV2.find((l) => l.is_csp), [lineasV2]);
  const pctFijos = useMemo(() => {
    return lineasV2.filter((l) => !l.is_csp).reduce((acc, l) => acc + (numOrNull(l.pct_peso) ?? 0), 0);
  }, [lineasV2]);

  const pctCsp = useMemo(() => {
    if (!cspLinea) return null;
    return 100 - pctFijos;
  }, [cspLinea, pctFijos]);

  async function patchProducto(patch: { densidad_producto_g_ml: number | null }) {
    const r = await fetch(`/api/productos/${productoId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const j = await r.json().catch(() => ({} as any));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    if (j.producto) {
      const p = j.producto as any;
      p.densidad_producto_g_ml = numOrNull(p.densidad_producto_g_ml);
      setProducto(p);
    }
  }

  function getCostoOptionARSporUnidad(l: LineaV2): { ok: true; ars: number } | { ok: false; err: string } {
    if (l.tipo === "ITEM_PRESENTACION") {
      if (l.job_price_ars !== null && l.job_price_ars !== undefined) {
        return { ok: true, ars: Number(l.job_price_ars) };
      }

      const item_id = l.item_id ?? null;
      const pres = l.item_presentacion ?? null;
      if (!item_id || !pres) return { ok: false, err: "item/presentación incompletos" };
      const found = itemOptions.find((x) => x.item_id === item_id && Number(x.presentacion) === Number(pres));
      if (!found) return { ok: false, err: "precio no encontrado (job)" };
      return { ok: true, ars: Number(found.price_ars) };
    }

    if (l.tipo === "MANUAL_PRESENTACION") {
      if (l.manual_costo_ars === null || l.manual_costo_ars === undefined) return { ok: false, err: "falta costo manual" };
      return { ok: true, ars: Number(l.manual_costo_ars) };
    }

    if (l.tipo === "BULK_PRODUCTO") {
      const bp = l.bulk_producto_id ?? null;
      if (!bp) return { ok: false, err: "bulk_producto_id faltante" };
      const arsKg = bulkCostByProducto[bp];
      if (arsKg === undefined) return { ok: false, err: "bulk: costo no cargado" };
      return { ok: true, ars: arsKg }; // ARS/kg
    }

    return { ok: false, err: "tipo no soportado" };
  }

  function getARSporGramo(l: LineaV2): { ok: true; arsPorG: number } | { ok: false; err: string } {
    const c = getCostoOptionARSporUnidad(l);
    if (!c.ok) return c;

    if (l.tipo === "ITEM_PRESENTACION") {
      const pres = l.item_presentacion ?? null;
      if (!pres || pres <= 0) return { ok: false, err: "presentación inválida" };
      return { ok: true, arsPorG: c.ars / pres };
    }

    if (l.tipo === "MANUAL_PRESENTACION") {
      const u = l.manual_uom;
      const qty = l.manual_cantidad ?? null;
      if (!u || !qty || qty <= 0) return { ok: false, err: "manual: falta uom/cantidad" };

      if (u === "GR") return { ok: true, arsPorG: c.ars / qty };

      if (u === "ML") {
        const dens = l.densidad_g_ml ?? null;
        if (!dens || dens <= 0) return { ok: false, err: "manual: falta densidad para convertir ML→GR" };
        const gramos = qty * dens;
        if (gramos <= 0) return { ok: false, err: "manual: conversión inválida" };
        return { ok: true, arsPorG: c.ars / gramos };
      }

      if (u === "UN") return { ok: false, err: "manual: UN no convertible a gramos (definir masa por unidad)" };
      return { ok: false, err: "manual: uom inválida" };
    }

    if (l.tipo === "BULK_PRODUCTO") {
      return { ok: true, arsPorG: c.ars / 1000 };
    }

    return { ok: false, err: "conversión no soportada" };
  }

  const calc = useMemo(() => {
    const issues: { linea_id: number; msg: string }[] = [];

    const effectivePct = (l: LineaV2) => {
      if (l.is_csp) return pctCsp;
      return numOrNull(l.pct_peso);
    };

    const rows = lineasV2.map((l) => {
      const pct = effectivePct(l);
      const masa_g = pct === null ? null : (loteRefG * pct) / 100;

      const dens = numOrNull(l.densidad_g_ml);
      const vol_ml = masa_g !== null && dens && dens > 0 ? masa_g / dens : null;

      const arsG = getARSporGramo(l);
      const costo_linea = masa_g !== null && arsG.ok ? masa_g * arsG.arsPorG : null;

      if (pct === null) issues.push({ linea_id: l.linea_id, msg: "falta % p/p" });
      if (l.is_csp && pctCsp !== null && pctCsp < 0) issues.push({ linea_id: l.linea_id, msg: "CSP negativo (fijos > 100%)" });
      if (!arsG.ok) issues.push({ linea_id: l.linea_id, msg: arsG.err });

      return { l, pct, masa_g, vol_ml, costo_linea, arsG };
    });

    const sumPct = rows.reduce((acc, r) => acc + (r.pct ?? 0), 0);
    const totalARS = rows.reduce((acc, r) => acc + (r.costo_linea ?? 0), 0);

    const arsPorKg = loteRefG > 0 ? (totalARS / loteRefG) * 1000 : null;

    const lote_ref_kg = numOrNull(costosProd?.lote_ref_kg);
    const fijo = numOrNull(costosProd?.costo_fijo_por_lote_ars);
    const variable = numOrNull(costosProd?.costo_variable_por_kg_ars);
    const prodARSporKg =
      lote_ref_kg && fijo !== null && fijo !== undefined ? fijo / lote_ref_kg + (variable ?? 0) : variable ?? null;

    const arsPorKgConProd = arsPorKg !== null ? arsPorKg + (prodARSporKg ?? 0) : null;

    return { rows, sumPct, totalARS, arsPorKg, prodARSporKg, arsPorKgConProd, issues };
  }, [lineasV2, loteRefG, pctCsp, pctFijos, cspLinea, itemOptions, costosProd, bulkCostByProducto]);

  async function saveHeaderV2(
    patch: Partial<{
      lote_ref_g: number;
      lote_ref_kg: number | null;
      costo_fijo_por_lote_ars: number | null;
      costo_variable_por_kg_ars: number | null;
    }>
  ) {
    const body = {
      lote_ref_g: patch.lote_ref_g ?? (formulaV2?.lote_ref_g ?? 1000),
      lote_ref_kg: patch.lote_ref_kg ?? costosProd?.lote_ref_kg ?? null,
      costo_fijo_por_lote_ars: patch.costo_fijo_por_lote_ars ?? costosProd?.costo_fijo_por_lote_ars ?? null,
      costo_variable_por_kg_ars: patch.costo_variable_por_kg_ars ?? costosProd?.costo_variable_por_kg_ars ?? null,
    };

    const r = await fetch(`/api/productos/${productoId}/formula-v2`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({} as any));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    await loadAll();
  }

  async function ensureCostOptionItem(item_id: number, item_presentacion: number): Promise<number> {
    const r = await fetch(`/api/cost-options`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tipo: "ITEM_PRESENTACION", item_id, item_presentacion }),
    });
    const j = await r.json().catch(() => ({} as any));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    const id = Number(j.cost_option_id);
    if (!Number.isFinite(id)) throw new Error("cost_option_id inválido en respuesta");
    return id;
  }

  async function ensureCostOptionBulk(bulk_producto_id: number): Promise<number> {
    const r = await fetch(`/api/cost-options`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tipo: "BULK_PRODUCTO", bulk_producto_id }),
    });
    const j = await r.json().catch(() => ({} as any));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    const id = Number(j.cost_option_id);
    if (!Number.isFinite(id)) throw new Error("cost_option_id inválido en respuesta");
    return id;
  }

  async function ensureCostOptionManual(payload: {
    manual_nombre: string;
    manual_uom: "GR" | "ML" | "UN";
    manual_cantidad: number;
    manual_costo_ars: number;
    densidad_g_ml: number | null;
  }): Promise<number> {
    const r = await fetch(`/api/cost-options`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tipo: "MANUAL_PRESENTACION",
        manual_nombre: payload.manual_nombre,
        manual_uom: payload.manual_uom,
        manual_cantidad: payload.manual_cantidad,
        manual_costo_ars: payload.manual_costo_ars,
        densidad_g_ml: payload.densidad_g_ml,
      }),
    });
    const j = await r.json().catch(() => ({} as any));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    const id = Number(j.cost_option_id);
    if (!Number.isFinite(id)) throw new Error("cost_option_id inválido en respuesta");
    return id;
  }

  async function addLineaFromCostOption(cost_option_id: number) {
    const up = await fetch(`/api/productos/${productoId}/formula-v2/lineas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cost_option_id,
        pct_peso: null,
        is_csp: false,
        orden: 999,
      }),
    });
    const uj = await up.json().catch(() => ({} as any));
    if (!up.ok || !uj?.ok) throw new Error(uj?.error || `HTTP ${up.status}`);
    await loadAll();
  }

  async function addLineaFromItem(opt: ItemOption) {
    const cost_option_id = await ensureCostOptionItem(opt.item_id, opt.presentacion);
    await addLineaFromCostOption(cost_option_id);
  }

  async function addLineaFromBulk(bulk_producto_id: number) {
    const cost_option_id = await ensureCostOptionBulk(bulk_producto_id);
    await addLineaFromCostOption(cost_option_id);
  }

  async function createManualAndAdd() {
    const nombre = manualNombre.trim();
    const qty = numOrNull(manualCantidad);
    const ars = numOrNull(manualCostoARS);
    const dens = manualDens.trim() === "" ? null : numOrNull(manualDens);

    if (!nombre) throw new Error("manual: falta nombre");
    if (!qty || qty <= 0) throw new Error("manual: cantidad inválida");
    if (ars === null || ars < 0) throw new Error("manual: costo ARS inválido");
    if (manualUom === "ML" && (!dens || dens <= 0)) throw new Error("manual: UOM=ML requiere densidad g/ml");

    const cost_option_id = await ensureCostOptionManual({
      manual_nombre: nombre,
      manual_uom: manualUom,
      manual_cantidad: qty,
      manual_costo_ars: ars,
      densidad_g_ml: manualUom === "ML" ? dens! : dens ?? null,
    });

    await addLineaFromCostOption(cost_option_id);

    // limpiar form
    setManualNombre("");
    setManualCantidad("");
    setManualCostoARS("");
    setManualDens("");
  }

  async function patchLinea(linea_id: number, patch: any) {
    const r = await fetch(`/api/productos/${productoId}/formula-v2/lineas/${linea_id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const j = await r.json().catch(() => ({} as any));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    await loadAll();
  }

  async function deleteLinea(linea_id: number) {
    const r = await fetch(`/api/productos/${productoId}/formula-v2/lineas/${linea_id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({} as any));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    await loadAll();
  }

  async function patchCostOptionDensidad(cost_option_id: number, densidad_g_ml: number | null) {
    const r = await fetch(`/api/cost-options/${cost_option_id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ densidad_g_ml }),
    });
    const j = await r.json().catch(() => ({} as any));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    await loadAll();
  }

  function lineaLabel(l: LineaV2) {
    if (l.tipo === "ITEM_PRESENTACION") return `Item ${l.item_id} — Pres ${l.item_presentacion}`;
    if (l.tipo === "MANUAL_PRESENTACION")
      return `${l.manual_nombre ?? "Manual"} — ${l.manual_cantidad ?? "?"} ${l.manual_uom ?? ""}`;
    if (l.tipo === "BULK_PRODUCTO") return `Bulk producto ${l.bulk_producto_id}`;
    return `Opción ${l.cost_option_id}`;
  }

  const densProd = numOrNull(producto?.densidad_producto_g_ml);

  // Bulk info: mostrar dos valores (sin prod / con prod)
  const bulkARSkg_sin = numOrNull(calc.arsPorKg);
  const bulkARSkg_con = numOrNull(calc.arsPorKgConProd);

  const bulkARSl_sin = densProd !== null && bulkARSkg_sin !== null ? bulkARSkg_sin * densProd : null;
  const bulkARSl_con = densProd !== null && bulkARSkg_con !== null ? bulkARSkg_con * densProd : null;

  // (opcional) endpoint histórico bulk; solo info
  const bulkEndpointARSkg = numOrNull(bulkSelf?.ars_por_kg);
  const bulkEndpointARSl = densProd !== null && bulkEndpointARSkg !== null ? bulkEndpointARSkg * densProd : null;

  const manualOptions = useMemo(() => {
    const q = manualSearch.trim().toLowerCase();
    const rows = extraOptions.filter((x) => x.tipo === "MANUAL_PRESENTACION" && x.activo);
    if (!q) return rows;
    return rows.filter((x) => (x.manual_nombre ?? "").toLowerCase().includes(q));
  }, [extraOptions, manualSearch]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{producto?.nombre ?? `Producto ${productoId}`}</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Editor + ofertas + costeo</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {loading ? <span style={{ fontSize: 12, opacity: 0.75 }}>Cargando…</span> : null}
          {error ? <span style={{ fontSize: 12, color: "tomato" }}>{error}</span> : null}
          <button
            onClick={loadAll}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            Refrescar
          </button>
        </div>
      </div>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: 12,
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Fórmula v2</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Lote referencia: {loteRefG} g</div>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
              Lote ref (g)
              <input
                type="number"
                step="1"
                defaultValue={String(loteRefG)}
                onBlur={async (e) => {
                  const v = clamp(Number(e.target.value), 1, 1_000_000);
                  try {
                    await saveHeaderV2({ lote_ref_g: v });
                  } catch (err: any) {
                    setError(err?.message || "error");
                  }
                }}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.03)",
                  width: 140,
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
              Densidad producto (g/ml)
              <input
                type="number"
                step="0.0001"
                key={`dens-prod-${producto?.producto_id ?? "x"}-${producto?.densidad_producto_g_ml ?? ""}`}
                defaultValue={String(producto?.densidad_producto_g_ml ?? "")}
                placeholder="(opcional)"
                onBlur={async (e) => {
                  const v = parseBlurNumber(e.target.value);
                  try {
                    await patchProducto({ densidad_producto_g_ml: v });
                  } catch (err: any) {
                    setError(err?.message || "error");
                  }
                }}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.03)",
                  width: 190,
                }}
              />
            </label>

            {/* Costos de producción en header (editables) */}
            <div
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                padding: "10px 12px",
                display: "grid",
                gap: 10,
                background: "rgba(255,255,255,0.02)",
                minWidth: 360,
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 700 }}>Costos de producción</div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
                <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                  Lote ref (kg)
                  <input
                    type="number"
                    step="0.0001"
                    key={`cp-lote-${costosProd?.lote_ref_kg ?? ""}`}
                    defaultValue={String(costosProd?.lote_ref_kg ?? "")}
                    placeholder="(opcional)"
                    onBlur={async (e) => {
                      const v = parseBlurNumber(e.target.value);
                      try {
                        await saveHeaderV2({ lote_ref_kg: v });
                      } catch (err: any) {
                        setError(err?.message || "error");
                      }
                    }}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(255,255,255,0.03)",
                      width: 130,
                    }}
                  />
                </label>

                <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                  Fijo por lote (ARS)
                  <input
                    type="number"
                    step="0.01"
                    key={`cp-fijo-${costosProd?.costo_fijo_por_lote_ars ?? ""}`}
                    defaultValue={String(costosProd?.costo_fijo_por_lote_ars ?? "")}
                    placeholder="(opcional)"
                    onBlur={async (e) => {
                      const v = parseBlurNumber(e.target.value);
                      try {
                        await saveHeaderV2({ costo_fijo_por_lote_ars: v });
                      } catch (err: any) {
                        setError(err?.message || "error");
                      }
                    }}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(255,255,255,0.03)",
                      width: 170,
                    }}
                  />
                </label>

                <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                  Variable (ARS/kg)
                  <input
                    type="number"
                    step="0.01"
                    key={`cp-var-${costosProd?.costo_variable_por_kg_ars ?? ""}`}
                    defaultValue={String(costosProd?.costo_variable_por_kg_ars ?? "")}
                    placeholder="(opcional)"
                    onBlur={async (e) => {
                      const v = parseBlurNumber(e.target.value);
                      try {
                        await saveHeaderV2({ costo_variable_por_kg_ars: v });
                      } catch (err: any) {
                        setError(err?.message || "error");
                      }
                    }}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(255,255,255,0.03)",
                      width: 170,
                    }}
                  />
                </label>
              </div>

              <div style={{ fontSize: 12, opacity: 0.85 }}>
                ARS/kg prod: {fmtMaybe(calc.prodARSporKg, 2)} · ARS/kg total: {fmtMaybe(calc.arsPorKgConProd, 2)}
              </div>
            </div>

            {/* Bulk info */}
            <div
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                padding: "10px 12px",
                display: "grid",
                gap: 4,
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 700 }}>Bulk (info)</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>ARS/kg (sin prod): {fmtMaybe(bulkARSkg_sin, 2)}</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>ARS/kg (con prod): {fmtMaybe(bulkARSkg_con, 2)}</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>Dens g/ml: {fmtMaybe(densProd, 4)}</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>ARS/L (sin prod): {fmtMaybe(bulkARSl_sin, 2)}</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>ARS/L (con prod): {fmtMaybe(bulkARSl_con, 2)}</div>
              <div style={{ fontSize: 12, opacity: 0.65 }}>
                endpoint ARS/kg: {fmtMaybe(bulkEndpointARSkg, 2)} · ARS/L: {fmtMaybe(bulkEndpointARSl, 2)}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, opacity: 0.85 }}>
            <div>CSP: {cspLinea ? `sí (linea ${cspLinea.linea_id})` : "no"}</div>
            <div>% fijos: {fmtMaybe(pctFijos, 4)}</div>
            <div>% total: {fmtMaybe(calc.sumPct, 4)}</div>
            <div>ARS/kg (sin prod): {fmtMaybe(calc.arsPorKg, 2)}</div>
            <div>ARS/kg prod: {fmtMaybe(calc.prodARSporKg, 2)}</div>
            <div>ARS/kg total: {fmtMaybe(calc.arsPorKgConProd, 2)}</div>
          </div>

          {calc.issues.length ? (
            <div style={{ fontSize: 12, color: "tomato" }}>
              {calc.issues.slice(0, 6).map((x, i) => (
                <div key={i}>
                  linea {x.linea_id}: {x.msg}
                </div>
              ))}
              {calc.issues.length > 6 ? <div>…({calc.issues.length - 6} más)</div> : null}
            </div>
          ) : null}
        </div>

        <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", background: "rgba(255,255,255,0.04)" }}>
                <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Componente</th>
                <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>CSP</th>
                <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>% p/p</th>
                <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Masa (g)</th>
                <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Dens (g/ml)</th>
                <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Vol (ml)</th>
                <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Costo (ARS)</th>
                <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}></th>
              </tr>
            </thead>
            <tbody>
              {calc.rows.map((r) => (
                <tr key={r.l.linea_id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <td style={{ padding: 10 }}>
                    <div style={{ fontWeight: 600 }}>{lineaLabel(r.l)}</div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      opt #{r.l.cost_option_id} · tipo {r.l.tipo}
                      {r.l.tipo === "ITEM_PRESENTACION" && r.l.job_as_of_date ? ` · job ${r.l.job_as_of_date}` : ""}
                    </div>
                  </td>

                  <td style={{ padding: 10 }}>
                    <input
                      type="checkbox"
                      checked={!!r.l.is_csp}
                      onChange={async (e) => {
                        try {
                          await patchLinea(r.l.linea_id, { is_csp: e.target.checked });
                        } catch (err: any) {
                          setError(err?.message || "error");
                        }
                      }}
                    />
                  </td>

                  <td style={{ padding: 10 }}>
                    <input
                      key={`${r.l.linea_id}:${r.l.pct_peso ?? ""}:${r.l.is_csp ? "csp" : "fix"}`}
                      defaultValue={r.l.is_csp ? String(r.pct ?? "") : String(r.l.pct_peso ?? "")}
                      disabled={r.l.is_csp}
                      onBlur={async (e) => {
                        if (r.l.is_csp) return;
                        const v = e.target.value.trim() === "" ? null : Number(e.target.value);
                        try {
                          await patchLinea(r.l.linea_id, { pct_peso: v });
                        } catch (err: any) {
                          setError(err?.message || "error");
                        }
                      }}
                      style={{
                        padding: "6px 8px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: r.l.is_csp ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.03)",
                        width: 90,
                      }}
                    />
                  </td>

                  <td style={{ padding: 10 }}>{r.masa_g === null ? "-" : r.masa_g.toFixed(4)}</td>

                  <td style={{ padding: 10 }}>
                    <input
                      defaultValue={String(r.l.densidad_g_ml ?? "")}
                      placeholder="(opción)"
                      onBlur={async (e) => {
                        const v = e.target.value.trim() === "" ? null : Number(e.target.value);
                        try {
                          await patchCostOptionDensidad(r.l.cost_option_id, v);
                        } catch (err: any) {
                          setError(err?.message || "error");
                        }
                      }}
                      style={{
                        padding: "6px 8px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: "rgba(255,255,255,0.03)",
                        width: 110,
                      }}
                    />
                  </td>

                  <td style={{ padding: 10 }}>{r.vol_ml === null ? "-" : r.vol_ml.toFixed(4)}</td>
                  <td style={{ padding: 10 }}>{r.costo_linea === null ? "-" : r.costo_linea.toFixed(2)}</td>

                  <td style={{ padding: 10 }}>
                    <button
                      onClick={async () => {
                        try {
                          await deleteLinea(r.l.linea_id);
                        } catch (err: any) {
                          setError(err?.message || "error");
                        }
                      }}
                      style={{
                        padding: "6px 8px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: "rgba(255,80,80,0.10)",
                      }}
                    >
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}

              {!calc.rows.length ? (
                <tr>
                  <td colSpan={8} style={{ padding: 10, opacity: 0.75 }}>
                    Sin líneas.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* selector job */}
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Opciones (job)</div>

            <input
              value={searchOpt}
              onChange={(e) => setSearchOpt(e.target.value)}
              placeholder="buscar proveedor/url"
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.03)",
                width: 260,
              }}
            />

            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, opacity: 0.85 }}>
              <input type="checkbox" checked={soloSel} onChange={(e) => setSoloSel(e.target.checked)} /> solo seleccionados
            </label>

            <button
              onClick={loadAll}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              Buscar
            </button>

            <div style={{ fontSize: 12, opacity: 0.75 }}>Items encontrados: {itemOptions.length}</div>
          </div>

          <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", background: "rgba(255,255,255,0.04)" }}>
                  <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Proveedor</th>
                  <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Item</th>
                  <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Pres</th>
                  <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>ARS</th>
                  <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Fecha</th>
                  <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}></th>
                </tr>
              </thead>
              <tbody>
                {itemOptions.slice(0, 80).map((x, idx) => (
                  <tr key={`${x.item_id}-${x.presentacion}-${idx}`} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <td style={{ padding: 10 }}>
                      <div style={{ fontWeight: 600 }}>{x.proveedor_nombre || x.proveedor_codigo || "-"}</div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>{x.proveedor_codigo}</div>
                    </td>
                    <td style={{ padding: 10 }}>
                      <div style={{ fontWeight: 600 }}>#{x.item_id}</div>
                      <div
                        style={{
                          fontSize: 12,
                          opacity: 0.75,
                          maxWidth: 520,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {x.url_original || x.url_canonica}
                      </div>
                    </td>
                    <td style={{ padding: 10 }}>{String(x.presentacion)}</td>
                    <td style={{ padding: 10 }}>{fmtMaybe(x.price_ars, 2)}</td>
                    <td style={{ padding: 10 }}>{x.as_of_date}</td>
                    <td style={{ padding: 10 }}>
                      <button
                        onClick={async () => {
                          try {
                            await addLineaFromItem(x);
                          } catch (err: any) {
                            setError(err?.message || "error");
                          }
                        }}
                        style={{
                          padding: "6px 8px",
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.14)",
                          background: "rgba(255,255,255,0.03)",
                        }}
                      >
                        Agregar
                      </button>
                    </td>
                  </tr>
                ))}
                {!itemOptions.length ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 10, opacity: 0.75 }}>
                      Sin opciones (revisar job / filtros).
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {/* selector bulks */}
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Bulks (productos formulados)</div>

            <input
              value={bulkSearch}
              onChange={(e) => setBulkSearch(e.target.value)}
              placeholder="buscar producto"
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.03)",
                width: 260,
              }}
            />

            <button
              onClick={loadBulks}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              Buscar bulks
            </button>

            {bulkLoading ? <span style={{ fontSize: 12, opacity: 0.75 }}>Cargando…</span> : null}
            <div style={{ fontSize: 12, opacity: 0.75 }}>Resultados: {bulkRows.length}</div>
          </div>

          <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", background: "rgba(255,255,255,0.04)" }}>
                  <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Producto</th>
                  <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Dens (g/ml)</th>
                  <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>ARS/kg</th>
                  <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>ARS/L</th>
                  <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}></th>
                </tr>
              </thead>
              <tbody>
                {bulkRows.slice(0, 50).map((b) => {
                  const dens = numOrNull(b.densidad_producto_g_ml);
                  const arsKg = numOrNull(b.ars_por_kg);
                  const arsL = dens !== null && arsKg !== null ? arsKg * dens : null;

                  return (
                    <tr key={b.producto_id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                      <td style={{ padding: 10 }}>
                        <div style={{ fontWeight: 600 }}>{b.nombre}</div>
                        <div style={{ fontSize: 12, opacity: 0.75 }}>#{b.producto_id}</div>
                      </td>
                      <td style={{ padding: 10 }}>{fmtMaybe(dens, 4)}</td>
                      <td style={{ padding: 10 }}>{fmtMaybe(arsKg, 2)}</td>
                      <td style={{ padding: 10 }}>{fmtMaybe(arsL, 2)}</td>
                      <td style={{ padding: 10 }}>
                        <button
                          onClick={async () => {
                            try {
                              await addLineaFromBulk(b.producto_id);
                            } catch (err: any) {
                              setError(err?.message || "error");
                            }
                          }}
                          style={{
                            padding: "6px 8px",
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.14)",
                            background: "rgba(255,255,255,0.03)",
                          }}
                        >
                          Agregar
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!bulkRows.length ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 10, opacity: 0.75 }}>
                      Sin resultados. (Buscar bulks)
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {/* MANUALES */}
        <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Componentes manuales</div>

          {/* Crear manual */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
              Nombre
              <input
                value={manualNombre}
                onChange={(e) => setManualNombre(e.target.value)}
                placeholder="ej: Agua"
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.03)",
                  width: 220,
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
              UOM
              <select
                value={manualUom}
                onChange={(e) => setManualUom(e.target.value as any)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.03)",
                  width: 110,
                }}
              >
                <option value="GR">GR</option>
                <option value="ML">ML</option>
                <option value="UN">UN</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
              Cantidad (presentación)
              <input
                value={manualCantidad}
                onChange={(e) => setManualCantidad(e.target.value)}
                placeholder={manualUom === "GR" ? "ej: 1000" : manualUom === "ML" ? "ej: 1000" : "ej: 1"}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.03)",
                  width: 170,
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
              Costo ARS (por presentación)
              <input
                value={manualCostoARS}
                onChange={(e) => setManualCostoARS(e.target.value)}
                placeholder="ej: 250"
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.03)",
                  width: 190,
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
              Densidad g/ml (opcional; req si UOM=ML)
              <input
                value={manualDens}
                onChange={(e) => setManualDens(e.target.value)}
                placeholder={manualUom === "ML" ? "ej: 1.0" : "(opcional)"}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.03)",
                  width: 260,
                }}
              />
            </label>

            <button
              onClick={async () => {
                try {
                  await createManualAndAdd();
                } catch (err: any) {
                  setError(err?.message || "error");
                }
              }}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              Crear y agregar
            </button>
          </div>

          {/* Reusar manuales */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 700 }}>Reusar manual existente</div>
            <input
              value={manualSearch}
              onChange={(e) => setManualSearch(e.target.value)}
              placeholder="buscar manual por nombre"
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.03)",
                width: 260,
              }}
            />
            <div style={{ fontSize: 12, opacity: 0.75 }}>Encontrados: {manualOptions.length}</div>
          </div>

          <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", background: "rgba(255,255,255,0.04)" }}>
                  <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Nombre</th>
                  <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Presentación</th>
                  <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>ARS</th>
                  <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Dens</th>
                  <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}></th>
                </tr>
              </thead>
              <tbody>
                {manualOptions.slice(0, 80).map((m) => (
                  <tr key={m.cost_option_id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <td style={{ padding: 10 }}>
                      <div style={{ fontWeight: 600 }}>{m.manual_nombre ?? "Manual"}</div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>opt #{m.cost_option_id}</div>
                    </td>
                    <td style={{ padding: 10 }}>
                      {fmtMaybe(m.manual_cantidad, 4)} {m.manual_uom ?? ""}
                    </td>
                    <td style={{ padding: 10 }}>{fmtMaybe(m.manual_costo_ars, 2)}</td>
                    <td style={{ padding: 10 }}>{fmtMaybe(m.densidad_g_ml, 4)}</td>
                    <td style={{ padding: 10 }}>
                      <button
                        onClick={async () => {
                          try {
                            await addLineaFromCostOption(m.cost_option_id);
                          } catch (err: any) {
                            setError(err?.message || "error");
                          }
                        }}
                        style={{
                          padding: "6px 8px",
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.14)",
                          background: "rgba(255,255,255,0.03)",
                        }}
                      >
                        Agregar
                      </button>
                    </td>
                  </tr>
                ))}
                {!manualOptions.length ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 10, opacity: 0.75 }}>
                      Sin manuales.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ofertas + packaging */}
      <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Ofertas</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Costo oferta = bulk (ARS/kg con prod) × masa/volumen + Σ(packaging)</div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 700 }}>Catálogo packaging</div>

          <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
            Nombre
            <input
              value={newPackNombre}
              onChange={(e) => setNewPackNombre(e.target.value)}
              placeholder="Ej: frasco 250ml"
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.03)",
                width: 220,
              }}
            />
          </label>

          {/* MVP: UOM fijo UN */}
          <div style={{ fontSize: 12, opacity: 0.75, paddingBottom: 2 }}>UOM: UN</div>

          <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
            Costo unit (ARS)
            <input
              value={newPackCosto}
              onChange={(e) => setNewPackCosto(e.target.value)}
              placeholder="0"
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.03)",
                width: 140,
              }}
            />
          </label>

          <button
            onClick={async () => {
              try {
                const nombre = newPackNombre.trim();
                const costo = numOrNull(newPackCosto);
                if (!nombre) throw new Error("packaging: falta nombre");
                if (costo === null || costo < 0) throw new Error("packaging: costo inválido");

                // MVP: unidad fija UN
                await createPackagingItem({ nombre, unidad: "UN", costo_unitario_ars: costo });
                setNewPackNombre("");
                setNewPackCosto("");
              } catch (err: any) {
                setError(err?.message || "error");
              }
            }}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            Crear
          </button>

          <button
            onClick={async () => {
              try {
                await loadPackagingItems();
              } catch (err: any) {
                setError(err?.message || "error");
              }
            }}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            Refrescar catálogo
          </button>
        </div>

        <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", background: "rgba(255,255,255,0.04)" }}>
                <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Oferta</th>
                <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Presentación</th>
                <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Packaging</th>
                <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Total</th>
                <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}></th>
              </tr>
            </thead>
            <tbody>
              {ofertas.map((o) => {
                const dens = numOrNull(o.densidad_override_g_ml) ?? densProd;

                const peso_neto_g = numOrNull(o.peso_neto_g);
                const volumen_neto_ml = numOrNull(o.volumen_neto_ml);
                const unidades_pack = numOrNull(o.unidades_pack);
                const masa_por_unidad_g = numOrNull(o.masa_por_unidad_g);
                const volumen_por_unidad_ml = numOrNull(o.volumen_por_unidad_ml);

                let masaTotalG: number | null = null;
                let volTotalML: number | null = null;

                if (peso_neto_g !== null && peso_neto_g > 0) {
                  masaTotalG = peso_neto_g;
                } else if (volumen_neto_ml !== null && volumen_neto_ml > 0) {
                  volTotalML = volumen_neto_ml;
                  if (dens !== null && dens > 0) masaTotalG = volTotalML * dens;
                } else if (unidades_pack !== null && unidades_pack > 0 && masa_por_unidad_g !== null && masa_por_unidad_g > 0) {
                  masaTotalG = unidades_pack * masa_por_unidad_g;
                } else if (unidades_pack !== null && unidades_pack > 0 && volumen_por_unidad_ml !== null && volumen_por_unidad_ml > 0) {
                  volTotalML = unidades_pack * volumen_por_unidad_ml;
                  if (dens !== null && dens > 0) masaTotalG = volTotalML * dens;
                }

                const bulkKg = bulkARSkg_con;
                const costoBase = bulkKg !== null && masaTotalG !== null ? (bulkKg * masaTotalG) / 1000 : null;

                const packRows = packagingByOferta[o.oferta_id] || [];
                const packSubtotal = packRows.reduce((acc, r) => {
                  const unit = numOrNull(r.costo_unitario_override_ars) ?? numOrNull(r.costo_unitario_ars) ?? 0;
                  return acc + Number(r.cantidad) * unit;
                }, 0);

                const total = costoBase === null ? null : costoBase + packSubtotal;
                const isOpen = !!ofertaOpen[o.oferta_id];

                const presLabel = (() => {
                  if (peso_neto_g !== null && peso_neto_g > 0) return `${peso_neto_g} g`;
                  if (volumen_neto_ml !== null && volumen_neto_ml > 0) return `${volumen_neto_ml} ml`;
                  if (unidades_pack !== null && unidades_pack > 0 && masa_por_unidad_g !== null && masa_por_unidad_g > 0)
                    return `${unidades_pack} × ${masa_por_unidad_g} g`;
                  if (unidades_pack !== null && unidades_pack > 0 && volumen_por_unidad_ml !== null && volumen_por_unidad_ml > 0)
                    return `${unidades_pack} × ${volumen_por_unidad_ml} ml`;
                  return "(sin datos)";
                })();

                return (
                  <>
                    <tr key={o.oferta_id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                      <td style={{ padding: 10 }}>
                        <div style={{ fontWeight: 600 }}>{o.nombre}</div>
                        <div style={{ fontSize: 12, opacity: 0.75 }}>
                          #{o.oferta_id} · {o.activo ? "activa" : "inactiva"}
                          {o.is_bulk ? " · bulk" : ""}
                        </div>
                      </td>
                      <td style={{ padding: 10 }}>
                        <div style={{ fontSize: 12 }}>{presLabel}</div>
                        <div style={{ fontSize: 12, opacity: 0.75 }}>
                          dens: {fmtMaybe(dens, 4)} · masa: {fmtMaybe(masaTotalG, 2)} g
                        </div>
                      </td>
                      <td style={{ padding: 10 }}>
                        <div style={{ fontSize: 12 }}>Subtotal: {packRows.length ? packSubtotal.toFixed(2) : "0.00"} ARS</div>
                        <div style={{ fontSize: 12, opacity: 0.75 }}>{packRows.length ? `${packRows.length} ítems` : "sin packaging"}</div>
                      </td>
                      <td style={{ padding: 10 }}>
                        <div style={{ fontSize: 12 }}>Base: {fmtMaybe(costoBase, 2)} ARS</div>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>Total: {fmtMaybe(total, 2)} ARS</div>
                      </td>
                      <td style={{ padding: 10 }}>
                        <button
                          onClick={async () => {
                            try {
                              const next = !isOpen;
                              setOfertaOpen((prev) => ({ ...prev, [o.oferta_id]: next }));
                              if (next) await loadPackagingForOferta(o.oferta_id);
                            } catch (err: any) {
                              setError(err?.message || "error");
                            }
                          }}
                          style={{
                            padding: "6px 8px",
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.14)",
                            background: "rgba(255,255,255,0.03)",
                          }}
                        >
                          {isOpen ? "Cerrar" : "Packaging"}
                        </button>
                      </td>
                    </tr>

                    {isOpen ? (
                      <tr style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                        <td colSpan={5} style={{ padding: 10 }}>
                          <div style={{ display: "grid", gap: 10 }}>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
                              <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                                Item
                                <select
                                  value={addPackItemByOferta[o.oferta_id]?.packaging_item_id ?? ""}
                                  onChange={(e) =>
                                    setAddPackItemByOferta((prev) => ({
                                      ...prev,
                                      [o.oferta_id]: { packaging_item_id: e.target.value, cantidad: prev[o.oferta_id]?.cantidad ?? "1" },
                                    }))
                                  }
                                  style={{
                                    padding: "8px 10px",
                                    borderRadius: 10,
                                    border: "1px solid rgba(255,255,255,0.14)",
                                    background: "rgba(255,255,255,0.03)",
                                    width: 280,
                                  }}
                                >
                                  <option value="">(seleccionar)</option>
                                  {packagingItems
                                    .filter((x) => x.activo)
                                    .map((it) => (
                                      <option key={it.packaging_item_id} value={String(it.packaging_item_id)}>
                                        {it.nombre} · {it.costo_unitario_ars.toFixed(2)} ARS/UN
                                      </option>
                                    ))}
                                </select>
                              </label>

                              <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                                Cantidad
                                <input
                                  value={addPackItemByOferta[o.oferta_id]?.cantidad ?? "1"}
                                  onChange={(e) =>
                                    setAddPackItemByOferta((prev) => ({
                                      ...prev,
                                      [o.oferta_id]: { packaging_item_id: prev[o.oferta_id]?.packaging_item_id ?? "", cantidad: e.target.value },
                                    }))
                                  }
                                  style={{
                                    padding: "8px 10px",
                                    borderRadius: 10,
                                    border: "1px solid rgba(255,255,255,0.14)",
                                    background: "rgba(255,255,255,0.03)",
                                    width: 120,
                                  }}
                                />
                              </label>

                              <button
                                onClick={async () => {
                                  try {
                                    const st = addPackItemByOferta[o.oferta_id];
                                    const pid = st?.packaging_item_id ? Number(st.packaging_item_id) : null;
                                    const qty = numOrNull(st?.cantidad);
                                    if (!pid || !Number.isFinite(pid)) throw new Error("packaging: seleccionar item");
                                    if (!qty || qty <= 0) throw new Error("packaging: cantidad inválida");
                                    await addOfertaPackaging(o.oferta_id, { packaging_item_id: pid, cantidad: qty });
                                    setAddPackItemByOferta((prev) => ({ ...prev, [o.oferta_id]: { packaging_item_id: "", cantidad: "1" } }));
                                  } catch (err: any) {
                                    setError(err?.message || "error");
                                  }
                                }}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 10,
                                  border: "1px solid rgba(255,255,255,0.14)",
                                  background: "rgba(255,255,255,0.03)",
                                }}
                              >
                                Agregar
                              </button>
                            </div>

                            <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, overflow: "hidden" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead>
                                  <tr style={{ textAlign: "left", background: "rgba(255,255,255,0.04)" }}>
                                    <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Item</th>
                                    <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Cantidad</th>
                                    <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Override ARS</th>
                                    <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Subtotal</th>
                                    <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(packagingByOferta[o.oferta_id] || []).map((r) => {
                                    const unit = numOrNull(r.costo_unitario_override_ars) ?? numOrNull(r.costo_unitario_ars) ?? 0;
                                    const sub = Number(r.cantidad) * unit;
                                    return (
                                      <tr key={r.oferta_packaging_id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                                        <td style={{ padding: 10 }}>
                                          <div style={{ fontWeight: 600 }}>{r.nombre}</div>
                                          <div style={{ fontSize: 12, opacity: 0.75 }}>
                                            #{r.packaging_item_id} · {r.costo_unitario_ars.toFixed(2)} ARS/UN
                                          </div>
                                        </td>

                                        <td style={{ padding: 10 }}>
                                          <input
                                            key={`qty-${r.oferta_packaging_id}-${r.cantidad}`}
                                            defaultValue={String(r.cantidad)}
                                            onBlur={async (e) => {
                                              try {
                                                const v = parseBlurNumber(e.target.value);
                                                if (!v || v <= 0) throw new Error("cantidad inválida");
                                                await patchOfertaPackaging(o.oferta_id, r.oferta_packaging_id, { cantidad: v });
                                              } catch (err: any) {
                                                setError(err?.message || "error");
                                              }
                                            }}
                                            style={{
                                              padding: "6px 8px",
                                              borderRadius: 10,
                                              border: "1px solid rgba(255,255,255,0.14)",
                                              background: "rgba(255,255,255,0.03)",
                                              width: 120,
                                            }}
                                          />
                                        </td>

                                        <td style={{ padding: 10 }}>
                                          <input
                                            key={`ov-${r.oferta_packaging_id}-${r.costo_unitario_override_ars ?? ""}`}
                                            defaultValue={String(r.costo_unitario_override_ars ?? "")}
                                            placeholder="(opcional)"
                                            onBlur={async (e) => {
                                              try {
                                                const v = parseBlurNumber(e.target.value);
                                                await patchOfertaPackaging(o.oferta_id, r.oferta_packaging_id, { costo_unitario_override_ars: v });
                                              } catch (err: any) {
                                                setError(err?.message || "error");
                                              }
                                            }}
                                            style={{
                                              padding: "6px 8px",
                                              borderRadius: 10,
                                              border: "1px solid rgba(255,255,255,0.14)",
                                              background: "rgba(255,255,255,0.03)",
                                              width: 140,
                                            }}
                                          />
                                          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>unit: {unit.toFixed(2)}</div>
                                        </td>

                                        <td style={{ padding: 10, fontSize: 12 }}>{sub.toFixed(2)} ARS</td>

                                        <td style={{ padding: 10 }}>
                                          <button
                                            onClick={async () => {
                                              try {
                                                await deleteOfertaPackaging(o.oferta_id, r.oferta_packaging_id);
                                              } catch (err: any) {
                                                setError(err?.message || "error");
                                              }
                                            }}
                                            style={{
                                              padding: "6px 8px",
                                              borderRadius: 10,
                                              border: "1px solid rgba(255,255,255,0.14)",
                                              background: "rgba(255,80,80,0.10)",
                                            }}
                                          >
                                            Borrar
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}

                                  {!(packagingByOferta[o.oferta_id] || []).length ? (
                                    <tr>
                                      <td colSpan={5} style={{ padding: 10, opacity: 0.75 }}>
                                        Sin packaging.
                                      </td>
                                    </tr>
                                  ) : null}
                                </tbody>
                              </table>
                            </div>

                            <div style={{ fontSize: 12, opacity: 0.85 }}>
                              Subtotal packaging: {packSubtotal.toFixed(2)} ARS · Total oferta: {fmtMaybe(total, 2)} ARS
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </>
                );
              })}

              {!ofertas.length ? (
                <tr>
                  <td colSpan={5} style={{ padding: 10, opacity: 0.75 }}>
                    Sin ofertas.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
