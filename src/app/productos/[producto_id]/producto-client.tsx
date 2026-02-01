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

type Base =
  | {
      producto_id: number;
      tipo_base: "INSUMO";
      insumo_id: number;
      item_id: null;
      presentacion_preferida: null;
    }
  | {
      producto_id: number;
      tipo_base: "ITEM";
      insumo_id: null;
      item_id: number;
      presentacion_preferida: number;
    };

type Formula = {
  producto_id: number;
  rendimiento_total_g: number;
  densidad_formula_g_ml: number | null;
  notas: string | null;
};

type Linea = {
  linea_id: number;
  producto_id: number;
  insumo_id: number;
  pct_peso: number;
  orden: number;
};

type Insumo = {
  insumo_id: number;
  nombre: string;
  tipo_uom: "GR" | "ML" | "UN";
  densidad_g_ml: number | null;
  activo: boolean;
};

type ItemRow = {
  item_id: number;
  proveedor_codigo: string;
  proveedor_nombre: string;
  url_original: string;
  estado: string;
};

type Oferta = {
  oferta_id: number;
  producto_id: number;
  nombre: string;
  peso_neto_g: number | null;
  volumen_neto_ml: number | null;
  unidades_pack: number | null;
  masa_por_unidad_g: number | null;
  volumen_por_unidad_ml: number | null;
  densidad_override_g_ml: number | null;
  merma_pct: number | null;
  activo: boolean;
};

type Costeo = any;

function numOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

export default function ProductoClient({ productoId }: { productoId: number }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [producto, setProducto] = useState<Producto | null>(null);
  const [base, setBase] = useState<Base | null>(null);
  const [formula, setFormula] = useState<Formula | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [ofertas, setOfertas] = useState<Oferta[]>([]);

  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);

  const [modo, setModo] = useState<"BASE" | "FORMULA">("BASE");

  // Header edits
  const [nombre, setNombre] = useState("");
  const [densidadProducto, setDensidadProducto] = useState<string>("");

  // Base edits
  const [baseTipo, setBaseTipo] = useState<"INSUMO" | "ITEM">("INSUMO");
  const [baseInsumoId, setBaseInsumoId] = useState<string>("");
  const [baseItemId, setBaseItemId] = useState<string>("");
  const [basePresentacion, setBasePresentacion] = useState<string>("");

  // Formula edits
  const [rendimiento, setRendimiento] = useState<string>("1000");
  const [densidadFormula, setDensidadFormula] = useState<string>("");

  // Linea new
  const [newInsumoId, setNewInsumoId] = useState<string>("");
  const [newPct, setNewPct] = useState<string>("");

  // Oferta new
  const [newOfertaNombre, setNewOfertaNombre] = useState<string>("");
  const [newOfertaPeso, setNewOfertaPeso] = useState<string>("");
  const [newOfertaVol, setNewOfertaVol] = useState<string>("");

  const [costeo, setCosteo] = useState<Costeo | null>(null);
  const [costeoOfertaId, setCosteoOfertaId] = useState<number | null>(null);
  const [costeoLoading, setCosteoLoading] = useState(false);

  const insumoById = useMemo(() => {
    const m = new Map<number, Insumo>();
    for (const i of insumos) m.set(i.insumo_id, i);
    return m;
  }, [insumos]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [pR, oR, insR, itR] = await Promise.all([
        fetch(`/api/productos/${productoId}`, { cache: "no-store" }),
        fetch(`/api/productos/${productoId}/ofertas`, { cache: "no-store" }),
        fetch(`/api/insumos?limit=500&offset=0`, { cache: "no-store" }),
        fetch(`/api/items?limit=200&offset=0`, { cache: "no-store" }),
      ]);

      const pJ = await pR.json();
      if (!pR.ok || !pJ?.ok) throw new Error(pJ?.error || `HTTP ${pR.status}`);

      const oJ = await oR.json();
      if (!oR.ok || !oJ?.ok) throw new Error(oJ?.error || `HTTP ${oR.status}`);

      const insJ = await insR.json();
      if (!insR.ok || !insJ?.ok) throw new Error(insJ?.error || `HTTP ${insR.status}`);

      const itJ = await itR.json();
      if (!itR.ok || !itJ?.ok) throw new Error(itJ?.error || `HTTP ${itR.status}`);

      setProducto(pJ.producto);
      setBase(pJ.base);
      setFormula(pJ.formula);
      setLineas(pJ.lineas || []);
      setOfertas(oJ.ofertas || []);
      setInsumos(insJ.insumos || []);
      setItems(itJ.items || []);

      setNombre(pJ.producto?.nombre || "");
      setDensidadProducto(pJ.producto?.densidad_producto_g_ml === null || pJ.producto?.densidad_producto_g_ml === undefined ? "" : String(pJ.producto.densidad_producto_g_ml));

      if (pJ.base) {
        setBaseTipo(pJ.base.tipo_base);
        if (pJ.base.tipo_base === "INSUMO") {
          setBaseInsumoId(String(pJ.base.insumo_id || ""));
          setBaseItemId("");
          setBasePresentacion("");
        } else {
          setBaseItemId(String(pJ.base.item_id || ""));
          setBasePresentacion(String(pJ.base.presentacion_preferida || ""));
          setBaseInsumoId("");
        }
      }

      if (pJ.formula) {
        setRendimiento(String(pJ.formula.rendimiento_total_g ?? 1000));
        setDensidadFormula(pJ.formula.densidad_formula_g_ml === null || pJ.formula.densidad_formula_g_ml === undefined ? "" : String(pJ.formula.densidad_formula_g_ml));
      }

      // modo
      if (pJ.formula) setModo("FORMULA");
      else setModo("BASE");
    } catch (e: any) {
      setError(e?.message || "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productoId]);

  async function saveProductoHeader() {
    setError(null);
    const n = nombre.trim();
    if (!n) {
      setError("Nombre requerido");
      return;
    }
    const d = densidadProducto.trim() ? Number(densidadProducto) : null;
    if (d !== null && (!Number.isFinite(d) || d <= 0)) {
      setError("Densidad inválida");
      return;
    }

    const res = await fetch(`/api/productos/${productoId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nombre: n, densidad_producto_g_ml: d }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) {
      setError(j?.error || `HTTP ${res.status}`);
      return;
    }
    await loadAll();
  }

  async function saveBase() {
    setError(null);
    if (baseTipo === "INSUMO") {
      const id = Number(baseInsumoId);
      if (!Number.isFinite(id) || id <= 0) {
        setError("Seleccioná un insumo");
        return;
      }
      const res = await fetch(`/api/productos/${productoId}/base`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipo_base: "INSUMO", insumo_id: id }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setError(j?.error || `HTTP ${res.status}`);
        return;
      }
      await loadAll();
      setModo("BASE");
      return;
    }

    const itemId = Number(baseItemId);
    const pref = Number(basePresentacion);
    if (!Number.isFinite(itemId) || itemId <= 0) {
      setError("Seleccioná un item");
      return;
    }
    if (!Number.isFinite(pref) || pref <= 0) {
      setError("Presentación preferida requerida");
      return;
    }

    const res = await fetch(`/api/productos/${productoId}/base`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tipo_base: "ITEM", item_id: itemId, presentacion_preferida: pref }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) {
      setError(j?.error || `HTTP ${res.status}`);
      return;
    }
    await loadAll();
    setModo("BASE");
  }

  async function saveFormulaHeader() {
    setError(null);
    const r = Number(rendimiento);
    if (!Number.isFinite(r) || r <= 0) {
      setError("Rendimiento inválido");
      return;
    }
    const d = densidadFormula.trim() ? Number(densidadFormula) : null;
    if (d !== null && (!Number.isFinite(d) || d <= 0)) {
      setError("Densidad fórmula inválida");
      return;
    }

    const res = await fetch(`/api/productos/${productoId}/formula`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rendimiento_total_g: r, densidad_formula_g_ml: d }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) {
      setError(j?.error || `HTTP ${res.status}`);
      return;
    }
    await loadAll();
    setModo("FORMULA");
  }

  async function addLinea() {
    setError(null);
    const insumo_id = Number(newInsumoId);
    const pct = Number(newPct);
    if (!Number.isFinite(insumo_id) || insumo_id <= 0) {
      setError("Seleccioná un insumo");
      return;
    }
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setError("% inválido");
      return;
    }

    // Asegurar fórmula creada
    if (!formula) {
      await saveFormulaHeader();
    }

    const res = await fetch(`/api/productos/${productoId}/formula/lineas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ insumo_id, pct_peso: pct, orden: (lineas?.length || 0) * 10 + 10 }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) {
      setError(j?.error || `HTTP ${res.status}`);
      return;
    }
    setNewInsumoId("");
    setNewPct("");
    await loadAll();
  }

  async function deleteLinea(linea_id: number) {
    if (!confirm("Eliminar línea?") ) return;
    setError(null);
    const res = await fetch(`/api/productos/${productoId}/formula/lineas/${linea_id}`, { method: "DELETE" });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) {
      setError(j?.error || `HTTP ${res.status}`);
      return;
    }
    await loadAll();
  }

  async function createOferta() {
    setError(null);
    const n = newOfertaNombre.trim();
    if (!n) {
      setError("Nombre de oferta requerido");
      return;
    }
    const peso = numOrNull(newOfertaPeso);
    const vol = numOrNull(newOfertaVol);
    if ((peso === null || peso <= 0) && (vol === null || vol <= 0)) {
      setError("Definir peso o volumen");
      return;
    }

    const res = await fetch(`/api/productos/${productoId}/ofertas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nombre: n, peso_neto_g: peso, volumen_neto_ml: vol }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) {
      setError(j?.error || `HTTP ${res.status}`);
      return;
    }
    setNewOfertaNombre("");
    setNewOfertaPeso("");
    setNewOfertaVol("");
    await loadAll();
  }

  async function runCosteo(oferta_id: number) {
    setCosteoLoading(true);
    setCosteoOfertaId(oferta_id);
    setCosteo(null);
    try {
      const res = await fetch(`/api/productos/ofertas/${oferta_id}/costeo?debug=true`, { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setCosteo(j);
    } catch (e: any) {
      setCosteo({ ok: false, error: e?.message || "error" });
    } finally {
      setCosteoLoading(false);
    }
  }

  if (loading && !producto) {
    return <div style={{ opacity: 0.8 }}>Cargando...</div>;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {error ? (
        <div style={{ border: "1px solid rgba(255,99,71,0.5)", borderRadius: 12, padding: 10, color: "tomato" }}>{error}</div>
      ) : null}

      <section style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div style={{ fontWeight: 700 }}>Producto</div>
          <button
            onClick={saveProductoHeader}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
          >
            Guardar
          </button>
        </div>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 240px" }}>
          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Nombre</div>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Densidad default (g/mL)</div>
            <input
              value={densidadProducto}
              onChange={(e) => setDensidadProducto(e.target.value)}
              placeholder="1.020"
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
            />
          </label>
        </div>
      </section>

      <section style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div style={{ fontWeight: 700 }}>Contenido del producto</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="radio" checked={modo === "BASE"} onChange={() => setModo("BASE")} />
              <span style={{ fontSize: 12 }}>Base simple</span>
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="radio" checked={modo === "FORMULA"} onChange={() => setModo("FORMULA")} />
              <span style={{ fontSize: 12 }}>Fórmula</span>
            </label>
          </div>
        </div>

        {modo === "BASE" ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <select
                value={baseTipo}
                onChange={(e) => setBaseTipo(e.target.value as any)}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
              >
                <option value="INSUMO">100% de un insumo</option>
                <option value="ITEM">100% de un item proveedor</option>
              </select>

              <button
                onClick={saveBase}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
              >
                Guardar base
              </button>

              {base ? <span style={{ fontSize: 12, opacity: 0.75 }}>Actual: {base.tipo_base}</span> : <span style={{ fontSize: 12, opacity: 0.75 }}>Sin base</span>}
            </div>

            {baseTipo === "INSUMO" ? (
              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Insumo</div>
                <select
                  value={baseInsumoId}
                  onChange={(e) => setBaseInsumoId(e.target.value)}
                  style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
                >
                  <option value="">Seleccionar...</option>
                  {insumos
                    .filter((i) => i.activo)
                    .map((i) => (
                      <option key={i.insumo_id} value={String(i.insumo_id)}>
                        {i.nombre} ({i.tipo_uom})
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 220px" }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>Item</div>
                  <select
                    value={baseItemId}
                    onChange={(e) => setBaseItemId(e.target.value)}
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
                  >
                    <option value="">Seleccionar...</option>
                    {items.map((it) => (
                      <option key={it.item_id} value={String(it.item_id)}>
                        #{it.item_id} {it.proveedor_codigo}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>Presentación preferida</div>
                  <input
                    value={basePresentacion}
                    onChange={(e) => setBasePresentacion(e.target.value)}
                    placeholder="Ej: 1000"
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
                  />
                </label>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                onClick={saveFormulaHeader}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
              >
                Guardar fórmula
              </button>
              {formula ? <span style={{ fontSize: 12, opacity: 0.75 }}>Fórmula activa</span> : <span style={{ fontSize: 12, opacity: 0.75 }}>Sin fórmula (se creará al guardar)</span>}
            </div>

            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "240px 240px" }}>
              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Rendimiento base (g)</div>
                <input
                  value={rendimiento}
                  onChange={(e) => setRendimiento(e.target.value)}
                  style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Densidad fórmula (g/mL) (opcional)</div>
                <input
                  value={densidadFormula}
                  onChange={(e) => setDensidadFormula(e.target.value)}
                  placeholder="1.020"
                  style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
                />
              </label>
            </div>

            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 140px 140px" }}>
              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Agregar insumo</div>
                <select
                  value={newInsumoId}
                  onChange={(e) => setNewInsumoId(e.target.value)}
                  style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
                >
                  <option value="">Seleccionar...</option>
                  {insumos
                    .filter((i) => i.activo && i.tipo_uom !== "UN")
                    .map((i) => (
                      <option key={i.insumo_id} value={String(i.insumo_id)}>
                        {i.nombre} ({i.tipo_uom})
                      </option>
                    ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>% p/p</div>
                <input
                  value={newPct}
                  onChange={(e) => setNewPct(e.target.value)}
                  placeholder="0-100"
                  style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
                />
              </label>

              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <button
                  onClick={addLinea}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
                >
                  Añadir
                </button>
              </div>
            </div>

            <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", background: "rgba(255,255,255,0.04)" }}>
                    <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Insumo</th>
                    <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>% p/p</th>
                    <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l) => {
                    const i = insumoById.get(l.insumo_id);
                    return (
                      <tr key={l.linea_id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                        <td style={{ padding: 10 }}>{i ? `${i.nombre} (${i.tipo_uom})` : `Insumo ${l.insumo_id}`}</td>
                        <td style={{ padding: 10 }}>{l.pct_peso}</td>
                        <td style={{ padding: 10, width: 1 }}>
                          <button
                            onClick={() => deleteLinea(l.linea_id)}
                            style={{ padding: "6px 8px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
                          >
                            Borrar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!lineas.length ? (
                    <tr>
                      <td colSpan={3} style={{ padding: 10, opacity: 0.75 }}>
                        Sin líneas.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 700 }}>Ofertas</div>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 180px 180px 140px" }}>
          <input
            value={newOfertaNombre}
            onChange={(e) => setNewOfertaNombre(e.target.value)}
            placeholder="Nombre (ej: 250 mL PET)"
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
          />
          <input
            value={newOfertaPeso}
            onChange={(e) => setNewOfertaPeso(e.target.value)}
            placeholder="peso g"
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
          />
          <input
            value={newOfertaVol}
            onChange={(e) => setNewOfertaVol(e.target.value)}
            placeholder="volumen mL"
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
          />
          <button
            onClick={createOferta}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
          >
            Crear
          </button>
        </div>

        <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", background: "rgba(255,255,255,0.04)" }}>
                <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Oferta</th>
                <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Presentación</th>
                <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}></th>
              </tr>
            </thead>
            <tbody>
              {ofertas.map((o) => {
                const pres = o.peso_neto_g ? `${o.peso_neto_g} g` : o.volumen_neto_ml ? `${o.volumen_neto_ml} mL` : "(pack)";
                return (
                  <tr key={o.oferta_id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <td style={{ padding: 10 }}>{o.nombre} <span style={{ opacity: 0.7, fontSize: 12 }}>#{o.oferta_id}</span></td>
                    <td style={{ padding: 10 }}>{pres}</td>
                    <td style={{ padding: 10, width: 1 }}>
                      <button
                        onClick={() => runCosteo(o.oferta_id)}
                        style={{ padding: "6px 8px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
                      >
                        Costear
                      </button>
                    </td>
                  </tr>
                );
              })}
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
      </section>

      <section style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div style={{ fontWeight: 700 }}>Costeo</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>{costeoOfertaId ? `Oferta #${costeoOfertaId}` : "(seleccionar oferta)"}</div>
        </div>

        {costeoLoading ? <div style={{ opacity: 0.75 }}>Calculando...</div> : null}

        {costeo ? (
          <div style={{ display: "grid", gap: 10 }}>
            {costeo.ok ? (
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.85 }}>Status: {costeo.status}</div>
                {costeo.totals ? (
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 12 }}>Total: <b>{costeo.totals.costo_total_ars ?? "-"}</b></div>
                    <div style={{ fontSize: 12 }}>$/g: <b>{costeo.totals.costo_por_g_ars ?? "-"}</b></div>
                    <div style={{ fontSize: 12 }}>$/kg: <b>{costeo.totals.costo_por_kg_ars ?? "-"}</b></div>
                    <div style={{ fontSize: 12 }}>$/mL: <b>{costeo.totals.costo_por_ml_ars ?? "-"}</b></div>
                  </div>
                ) : null}
                {costeo.issues?.length ? (
                  <details>
                    <summary style={{ cursor: "pointer" }}>Issues ({costeo.issues.length})</summary>
                    <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, opacity: 0.9 }}>{JSON.stringify(costeo.issues, null, 2)}</pre>
                  </details>
                ) : null}
              </div>
            ) : (
              <div style={{ color: "tomato" }}>{String(costeo.error || "error")}</div>
            )}

            <details>
              <summary style={{ cursor: "pointer" }}>Detalle completo (JSON)</summary>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, opacity: 0.9 }}>{JSON.stringify(costeo, null, 2)}</pre>
            </details>
          </div>
        ) : (
          <div style={{ opacity: 0.75, fontSize: 12 }}>Ejecutá “Costear” en una oferta.</div>
        )}
      </section>
    </div>
  );
}
