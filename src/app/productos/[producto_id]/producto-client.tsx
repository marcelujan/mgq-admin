"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Producto = {
  producto_id: number;
  nombre: string;
  densidad_producto_g_ml: number | null;
  activo: boolean;
};

type Base = { producto_id: number; tipo_base: "INSUMO" | "ITEM"; insumo_id?: number | null; item_id?: number | null; presentacion_preferida?: number | null } | null;

type Formula = { producto_id: number; rendimiento_total_g: number; densidad_formula_g_ml: number | null } | null;

type Linea = {
  linea_id: number;
  producto_id: number;
  componente_tipo: "INSUMO" | "OFERTA_BULK";
  insumo_id: number | null;
  oferta_bulk_id: number | null;
  pct_peso: number;
  orden: number;
};

type Oferta = {
  oferta_id: number;
  producto_id: number;
  nombre: string;
  is_bulk: boolean;
  peso_neto_g: number | null;
  volumen_neto_ml: number | null;
  unidades_pack: number | null;
  merma_pct: number | null;
  updated_at?: string;
};

type Componente = { kind: "INSUMO" | "OFERTA_BULK"; id: number; label: string; uom: "GR" | "ML" | "UN" };

type Insumo = { insumo_id: number; nombre: string; tipo_uom: "GR" | "ML" | "UN" };

export default function ProductoClient({ productoId }: { productoId: number }) {
  const [producto, setProducto] = useState<Producto | null>(null);
  const [base, setBase] = useState<Base>(null);
  const [formula, setFormula] = useState<Formula>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [componentes, setComponentes] = useState<Componente[]>([]);
  const [error, setError] = useState<string | null>(null);

  // UI states
  const [modo, setModo] = useState<"AUTO" | "BASE" | "FORMULA">("AUTO");

  // Add line
  const [compSel, setCompSel] = useState<string>(""); // "INSUMO:1" | "OFERTA_BULK:2"
  const [pctSel, setPctSel] = useState<string>("");

  // Create offer
  const [ofNombre, setOfNombre] = useState("Nueva oferta");
  const [ofIsBulk, setOfIsBulk] = useState(false);
  const [ofPeso, setOfPeso] = useState<string>("1000");

  // Costeo view
  const [costeoOfertaId, setCosteoOfertaId] = useState<number | null>(null);
  const [costeoJson, setCosteoJson] = useState<any>(null);
  const [costeoLoading, setCosteoLoading] = useState(false);

  const componentesByKey = useMemo(() => {
    const m = new Map<string, Componente>();
    for (const c of componentes) m.set(`${c.kind}:${c.id}`, c);
    return m;
  }, [componentes]);

  const pctSum = useMemo(() => lineas.reduce((acc, l) => acc + Number(l.pct_peso || 0), 0), [lineas]);

  const modoEfectivo = useMemo(() => {
    if (modo !== "AUTO") return modo;
    if (formula) return "FORMULA";
    if (base) return "BASE";
    return "FORMULA";
  }, [modo, base, formula]);

  async function loadAll() {
    setError(null);
    try {
      const r = await fetch(`/api/productos/${productoId}`, { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "error");
      setProducto(j.producto);
      setBase(j.base);
      setFormula(j.formula);
      setLineas(j.lineas || []);
      setOfertas(j.ofertas || []);
    } catch (e: any) {
      setError(e?.message ?? "error");
    }
  }

  async function loadInsumos() {
    const r = await fetch("/api/insumos?limit=500", { cache: "no-store" });
    const j = await r.json();
    if (j.ok) setInsumos(j.insumos || []);
  }

  async function loadComponentes() {
    const r = await fetch("/api/componentes?limit=500", { cache: "no-store" });
    const j = await r.json();
    if (j.ok) setComponentes(j.componentes || []);
  }

  useEffect(() => {
    if (!Number.isFinite(productoId)) return;
    loadAll();
    loadInsumos();
    loadComponentes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productoId]);

  async function setBaseInsumo(insumo_id: number) {
    setError(null);
    try {
      const r = await fetch(`/api/productos/${productoId}/base`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipo_base: "INSUMO", insumo_id }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "error");
      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "error");
    }
  }

  async function ensureFormula() {
    setError(null);
    try {
      const r = await fetch(`/api/productos/${productoId}/formula`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rendimiento_total_g: 1000 }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "error");
      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "error");
    }
  }

  async function addLinea() {
    setError(null);
    try {
      if (!compSel) throw new Error("Seleccioná un componente");
      const [kind, idStr] = compSel.split(":");
      const pct = Number(pctSel);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) throw new Error("pct inválido");

      const payload: any = { pct_peso: pct, orden: 0 };

      if (kind === "INSUMO") {
        payload.componente_tipo = "INSUMO";
        payload.insumo_id = Number(idStr);
      } else {
        payload.componente_tipo = "OFERTA_BULK";
        payload.oferta_bulk_id = Number(idStr);
      }

      const r = await fetch(`/api/productos/${productoId}/formula/lineas`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "error");
      setCompSel("");
      setPctSel("");
      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "error");
    }
  }

  async function delLinea(linea_id: number) {
    setError(null);
    try {
      const r = await fetch(`/api/productos/${productoId}/formula/lineas/${linea_id}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "error");
      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "error");
    }
  }

  async function crearOferta() {
    setError(null);
    try {
      const peso = Number(ofPeso);
      const r = await fetch(`/api/productos/${productoId}/ofertas`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nombre: ofNombre,
          is_bulk: ofIsBulk,
          peso_neto_g: Number.isFinite(peso) ? peso : null,
          volumen_neto_ml: null,
          unidades_pack: null,
          merma_pct: null,
          activo: true,
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "error");
      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "error");
    }
  }

  async function verCosteo(oferta_id: number) {
    setCosteoOfertaId(oferta_id);
    setCosteoJson(null);
    setCosteoLoading(true);
    try {
      const r = await fetch(`/api/productos/ofertas/${oferta_id}/costeo`, { cache: "no-store" });
      const j = await r.json();
      setCosteoJson(j);
    } finally {
      setCosteoLoading(false);
    }
  }

  if (!Number.isFinite(productoId)) return <div style={{ padding: 16 }}>producto_id inválido</div>;

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/productos">← Productos</Link>
        <h2 style={{ margin: 0 }}>{producto?.nombre ?? `Producto ${productoId}`}</h2>
      </div>

      {error && <div style={{ marginTop: 10, color: "crimson" }}>{error}</div>}

      <div style={{ marginTop: 12, border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <strong>Modo de contenido</strong>
          <select value={modo} onChange={(e) => setModo(e.target.value as any)}>
            <option value="AUTO">Auto</option>
            <option value="BASE">Base 100%</option>
            <option value="FORMULA">Fórmula</option>
          </select>
          <span style={{ opacity: 0.7 }}>actual: {modoEfectivo}</span>
        </div>

        {modoEfectivo === "BASE" ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ opacity: 0.8, marginBottom: 6 }}>Producto simple (100% de un insumo)</div>
            <select
              value={base?.tipo_base === "INSUMO" ? String(base.insumo_id ?? "") : ""}
              onChange={(e) => {
                const id = Number(e.target.value);
                if (Number.isFinite(id) && id > 0) setBaseInsumo(id);
              }}
            >
              <option value="">Seleccionar insumo...</option>
              {insumos.map((i) => (
                <option key={i.insumo_id} value={i.insumo_id}>
                  #{i.insumo_id} {i.nombre} ({i.tipo_uom})
                </option>
              ))}
            </select>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
              Si necesitás un componente que venga del cron, primero creá un insumo “Desde item” en <Link href="/insumos">/insumos</Link>.
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <strong>Fórmula (% p/p)</strong>
              {!formula && (
                <button onClick={ensureFormula}>
                  Crear fórmula (habilita edición)
                </button>
              )}
              <span style={{ opacity: 0.7 }}>% suma: {pctSum.toFixed(3)}</span>
              <button onClick={loadComponentes} style={{ marginLeft: "auto" }}>
                Recargar componentes
              </button>
            </div>

            {formula ? (
              <>
                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 110px 120px", gap: 8 }}>
                  <select value={compSel} onChange={(e) => setCompSel(e.target.value)}>
                    <option value="">Seleccionar componente...</option>
                    <optgroup label="Insumos">
                      {componentes
                        .filter((c) => c.kind === "INSUMO")
                        .map((c) => (
                          <option key={`${c.kind}:${c.id}`} value={`${c.kind}:${c.id}`}>
                            {c.label}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="Ofertas BULK (subproductos)">
                      {componentes
                        .filter((c) => c.kind === "OFERTA_BULK")
                        .map((c) => (
                          <option key={`${c.kind}:${c.id}`} value={`${c.kind}:${c.id}`}>
                            {c.label}
                          </option>
                        ))}
                    </optgroup>
                  </select>
                  <input value={pctSel} onChange={(e) => setPctSel(e.target.value)} placeholder="% p/p" />
                  <button onClick={addLinea}>Agregar</button>
                </div>

                <div style={{ marginTop: 10 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Componente</th>
                        <th style={{ textAlign: "right", borderBottom: "1px solid #ddd" }}>%</th>
                        <th style={{ borderBottom: "1px solid #ddd" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineas.map((l) => {
                        const key =
                          l.componente_tipo === "INSUMO"
                            ? `INSUMO:${l.insumo_id}`
                            : `OFERTA_BULK:${l.oferta_bulk_id}`;
                        const label = componentesByKey.get(key)?.label ?? key;
                        return (
                          <tr key={l.linea_id}>
                            <td style={{ padding: "6px 0" }}>{label}</td>
                            <td style={{ textAlign: "right" }}>{Number(l.pct_peso).toFixed(4)}</td>
                            <td style={{ textAlign: "right" }}>
                              <button onClick={() => delLinea(l.linea_id)}>borrar</button>
                            </td>
                          </tr>
                        );
                      })}
                      {lineas.length === 0 && (
                        <tr>
                          <td colSpan={3} style={{ padding: 10, opacity: 0.7 }}>
                            Sin líneas.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div style={{ marginTop: 10, opacity: 0.7 }}>No hay fórmula creada.</div>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <strong>Ofertas</strong>
          <span style={{ opacity: 0.7 }}>{ofertas.length} total</span>
        </div>

        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 120px 120px 120px", gap: 8 }}>
          <input value={ofNombre} onChange={(e) => setOfNombre(e.target.value)} placeholder="Nombre oferta" />
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={ofIsBulk} onChange={(e) => setOfIsBulk(e.target.checked)} />
            BULK
          </label>
          <input value={ofPeso} onChange={(e) => setOfPeso(e.target.value)} placeholder="peso g" />
          <button onClick={crearOferta}>Crear oferta</button>
        </div>

        <div style={{ marginTop: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Oferta</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Tipo</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd" }}>Presentación</th>
                <th style={{ borderBottom: "1px solid #ddd" }}></th>
              </tr>
            </thead>
            <tbody>
              {ofertas.map((o) => (
                <tr key={o.oferta_id}>
                  <td style={{ padding: "6px 0" }}>#{o.oferta_id} {o.nombre}</td>
                  <td>{o.is_bulk ? "BULK" : "VENTA"}</td>
                  <td style={{ textAlign: "right" }}>{o.peso_neto_g ? `${o.peso_neto_g} g` : o.volumen_neto_ml ? `${o.volumen_neto_ml} mL` : ""}</td>
                  <td style={{ textAlign: "right" }}>
                    <button onClick={() => verCosteo(o.oferta_id)}>costeo</button>
                  </td>
                </tr>
              ))}
              {ofertas.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 10, opacity: 0.7 }}>
                    No hay ofertas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {costeoOfertaId && (
          <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <strong>Costeo oferta #{costeoOfertaId}</strong>
              {costeoLoading && <span style={{ opacity: 0.7 }}>cargando...</span>}
            </div>

            {costeoJson && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>status</div>
                    <div>{costeoJson.status}</div>
                  </div>
                  <div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>costo total (ARS)</div>
                    <div>{costeoJson.totals?.costo_total_ars ?? ""}</div>
                  </div>
                  <div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>ARS / g</div>
                    <div>{costeoJson.totals?.costo_por_g_ars ?? ""}</div>
                  </div>
                  <div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>ARS / kg</div>
                    <div>{costeoJson.totals?.costo_por_kg_ars ?? ""}</div>
                  </div>
                </div>

                {Array.isArray(costeoJson.issues) && costeoJson.issues.length > 0 && (
                  <div style={{ marginTop: 10, color: "crimson" }}>
                    <div><strong>Issues</strong></div>
                    <ul style={{ marginTop: 6 }}>
                      {costeoJson.issues.map((it: any, idx: number) => (
                        <li key={idx}>
                          {it.code}: {it.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
