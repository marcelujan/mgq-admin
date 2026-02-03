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

  manual_nombre: string | null;
  manual_uom: "GR" | "ML" | "UN" | null;
  manual_cantidad: number | null;
  manual_costo_ars: number | null;

  bulk_producto_id: number | null;

  densidad_g_ml: number | null;
};

function numOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
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

  // bulk costs: producto_id -> ars_por_kg
  const [bulkCostByProducto, setBulkCostByProducto] = useState<Record<number, number>>({});

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [pR, oR, fR, lR, optR] = await Promise.all([
        fetch(`/api/productos/${productoId}`, { cache: "no-store" }),
        fetch(`/api/productos/${productoId}/ofertas`, { cache: "no-store" }),
        fetch(`/api/productos/${productoId}/formula-v2`, { cache: "no-store" }),
        fetch(`/api/productos/${productoId}/formula-v2/lineas`, { cache: "no-store" }),
        fetch(`/api/cost-options?limit=400&solo_seleccionados=${soloSel ? "true" : "false"}&search=${encodeURIComponent(searchOpt)}`, {
          cache: "no-store",
        }),
      ]);

      const pJ = await pR.json();
      if (!pR.ok || !pJ?.ok) throw new Error(pJ?.error || `HTTP ${pR.status}`);
      setProducto(pJ.producto);

      const oJ = await oR.json();
      if (!oR.ok || !oJ?.ok) throw new Error(oJ?.error || `HTTP ${oR.status}`);
      setOfertas(oJ.ofertas || []);

      const fJ = await fR.json();
      if (!fR.ok || !fJ?.ok) throw new Error(fJ?.error || `HTTP ${fR.status}`);
      setFormulaV2(fJ.formula);
      setCostosProd(fJ.costos_produccion);

      const lJ = await lR.json();
      if (!lR.ok || !lJ?.ok) throw new Error(lJ?.error || `HTTP ${lR.status}`);
      const lineas = (lJ.lineas || []) as LineaV2[];
      setLineasV2(lineas);

      const optJ = await optR.json();
      if (!optR.ok || !optJ?.ok) throw new Error(optJ?.error || `HTTP ${optR.status}`);
      setItemOptions(optJ.item_options || []);
      setExtraOptions(optJ.cost_options_extra || []);

      // Prefetch bulks usados en esta fórmula
      const bulkIds = Array.from(
        new Set(
          lineas
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
            return [id, Number(j.ars_por_kg)] as const;
          })
        );

        const next: Record<number, number> = {};
        for (const [id, arsKg] of results) next[id] = arsKg;
        setBulkCostByProducto(next);
      } else {
        setBulkCostByProducto({});
      }
    } catch (e: any) {
      setError(e?.message || "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loteRefG = formulaV2?.lote_ref_g ?? 1000;

  const cspLinea = useMemo(() => lineasV2.find((l) => l.is_csp), [lineasV2]);
  const pctFijos = useMemo(() => {
    return lineasV2
      .filter((l) => !l.is_csp)
      .reduce((acc, l) => acc + (numOrNull(l.pct_peso) ?? 0), 0);
  }, [lineasV2]);

  const pctCsp = useMemo(() => {
    if (!cspLinea) return null;
    return 100 - pctFijos;
  }, [cspLinea, pctFijos]);

  function getCostoOptionARSporUnidad(l: LineaV2): { ok: true; ars: number } | { ok: false; err: string } {
    if (l.tipo === "ITEM_PRESENTACION") {
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
      // “unidad” bulk será 1 kg (ARS/kg)
      return { ok: true, ars: arsKg };
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
      // c.ars = ARS/kg
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

      const dens = l.densidad_g_ml ?? null;
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

    const lote_ref_kg = costosProd?.lote_ref_kg ?? null;
    const fijo = costosProd?.costo_fijo_por_lote_ars ?? null;
    const variable = costosProd?.costo_variable_por_kg_ars ?? null;
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

  async function addLineaFromItem(opt: ItemOption) {
    const cost_option_id = await ensureCostOptionItem(opt.item_id, opt.presentacion);
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
    if (l.tipo === "MANUAL_PRESENTACION") return `${l.manual_nombre ?? "Manual"} — ${l.manual_cantidad ?? "?"} ${l.manual_uom ?? ""}`;
    if (l.tipo === "BULK_PRODUCTO") return `Bulk producto ${l.bulk_producto_id}`;
    return `Opción ${l.cost_option_id}`;
  }

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

      <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 12, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Fórmula v2 (incluye BULK)</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Lote referencia: {loteRefG} g</div>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
              Lote ref (g)
              <input
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
              Costos prod: lote ref (kg)
              <input
                defaultValue={String(costosProd?.lote_ref_kg ?? "")}
                onBlur={async (e) => {
                  const v = e.target.value.trim() === "" ? null : Number(e.target.value);
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
                  width: 160,
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
              Fijo ARS/lote
              <input
                defaultValue={String(costosProd?.costo_fijo_por_lote_ars ?? "")}
                onBlur={async (e) => {
                  const v = e.target.value.trim() === "" ? null : Number(e.target.value);
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
                  width: 160,
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
              Variable ARS/kg
              <input
                defaultValue={String(costosProd?.costo_variable_por_kg_ars ?? "")}
                onBlur={async (e) => {
                  const v = e.target.value.trim() === "" ? null : Number(e.target.value);
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
                  width: 160,
                }}
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, opacity: 0.85 }}>
            <div>CSP: {cspLinea ? `sí (linea ${cspLinea.linea_id})` : "no"}</div>
            <div>% fijos: {pctFijos.toFixed(4)}</div>
            <div>% total: {calc.sumPct.toFixed(4)}</div>
            <div>ARS/kg (sin prod): {calc.arsPorKg === null ? "-" : calc.arsPorKg.toFixed(2)}</div>
            <div>ARS/kg prod: {calc.prodARSporKg === null ? "-" : calc.prodARSporKg.toFixed(2)}</div>
            <div>ARS/kg total: {calc.arsPorKgConProd === null ? "-" : calc.arsPorKgConProd.toFixed(2)}</div>
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
                    <div style={{ fontSize: 12, opacity: 0.75 }}>opt #{r.l.cost_option_id} · tipo {r.l.tipo}</div>
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
                      value={r.l.is_csp ? String(r.pct ?? "") : String(r.l.pct_peso ?? "")}
                      disabled={r.l.is_csp}
                      onChange={() => {}}
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
                      <div style={{ fontSize: 12, opacity: 0.75, maxWidth: 520, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {x.url_original || x.url_canonica}
                      </div>
                    </td>
                    <td style={{ padding: 10 }}>{x.presentacion}</td>
                    <td style={{ padding: 10 }}>{x.price_ars.toFixed(2)}</td>
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
      </div>

      <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Ofertas</div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>Sin cambios en esta etapa (packaging/volumen se agrega luego).</div>

        <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", background: "rgba(255,255,255,0.04)" }}>
                <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Nombre</th>
                <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Bulk</th>
                <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Activo</th>
              </tr>
            </thead>
            <tbody>
              {ofertas.map((o) => (
                <tr key={o.oferta_id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <td style={{ padding: 10 }}>
                    <div style={{ fontWeight: 600 }}>{o.nombre}</div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>#{o.oferta_id}</div>
                  </td>
                  <td style={{ padding: 10 }}>{o.is_bulk ? "Sí" : "No"}</td>
                  <td style={{ padding: 10 }}>{o.activo ? "Sí" : "No"}</td>
                </tr>
              ))}
              {!ofertas.length ? (
                <tr>
                  <td colSpan={3} style={{ padding: 10, opacity: 0.75 }}>
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
