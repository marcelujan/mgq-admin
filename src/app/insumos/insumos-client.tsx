"use client";

import { useEffect, useMemo, useState } from "react";

type Insumo = {
  insumo_id: number;
  nombre: string;
  tipo_uom: "GR" | "ML" | "UN";
  densidad_g_ml: number | null;
  activo: boolean;
  notas: string | null;
  updated_at: string;
};

type ItemRow = {
  item_id: number;
  proveedor_codigo: string;
  proveedor_nombre: string;
  url_original: string;
  estado: string;
};

function numOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

export default function InsumosClient() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);

  // create form
  const [nombre, setNombre] = useState("");
  const [tipoUom, setTipoUom] = useState<"GR" | "ML" | "UN">("GR");
  const [densidad, setDensidad] = useState("");

  const [fuenteTipo, setFuenteTipo] = useState<"MANUAL" | "ITEM">("ITEM");
  const [costoManual, setCostoManual] = useState("");
  const [itemId, setItemId] = useState("");
  const [presentacionPref, setPresentacionPref] = useState("");
  const [prioridad, setPrioridad] = useState("10");

  const insumoCount = useMemo(() => insumos.length, [insumos]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [iR, itR] = await Promise.all([
        fetch(`/api/insumos?limit=500&offset=0`, { cache: "no-store" }),
        fetch(`/api/items?limit=500&offset=0`, { cache: "no-store" }),
      ]);
      const iJ = await iR.json();
      if (!iR.ok || !iJ?.ok) throw new Error(iJ?.error || `HTTP ${iR.status}`);
      const itJ = await itR.json();
      if (!itR.ok || !itJ?.ok) throw new Error(itJ?.error || `HTTP ${itR.status}`);

      setInsumos(iJ.insumos || []);
      setItems(itJ.items || []);
    } catch (e: any) {
      setError(e?.message || "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function createInsumo() {
    setError(null);
    const n = nombre.trim();
    if (!n) {
      setError("Nombre requerido");
      return;
    }

    const d = numOrNull(densidad);
    if (d !== null && (d <= 0 || !Number.isFinite(d))) {
      setError("Densidad inválida");
      return;
    }

    // 1) insumo
    const resI = await fetch(`/api/insumos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nombre: n, tipo_uom: tipoUom, densidad_g_ml: d, activo: true, notas: null }),
    });
    const jI = await resI.json().catch(() => null);
    if (!resI.ok || !jI?.ok) {
      setError(jI?.error || `HTTP ${resI.status}`);
      return;
    }
    const insumo_id = Number(jI.insumo_id);

    // 2) fuente
    const pr = numOrNull(prioridad) ?? 10;
    if (!Number.isFinite(pr)) {
      setError("Prioridad inválida");
      return;
    }

    if (fuenteTipo === "MANUAL") {
      const c = numOrNull(costoManual);
      if (c === null || c < 0) {
        setError("Costo manual inválido");
        return;
      }
      const resF = await fetch(`/api/insumos/${insumo_id}/fuentes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipo: "MANUAL", costo_por_uom_ars: c, vigente_desde: null, habilitada: true, prioridad: pr }),
      });
      const jF = await resF.json().catch(() => null);
      if (!resF.ok || !jF?.ok) {
        setError(jF?.error || `HTTP ${resF.status}`);
        return;
      }
    } else {
      const id = numOrNull(itemId);
      const pref = numOrNull(presentacionPref);
      if (id === null || id <= 0) {
        setError("Seleccionar item");
        return;
      }
      if (pref === null || pref <= 0) {
        setError("Presentación preferida requerida (>0)");
        return;
      }
      const resF = await fetch(`/api/insumos/${insumo_id}/fuentes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipo: "ITEM", item_id: id, presentacion_preferida: pref, habilitada: true, prioridad: pr }),
      });
      const jF = await resF.json().catch(() => null);
      if (!resF.ok || !jF?.ok) {
        setError(jF?.error || `HTTP ${resF.status}`);
        return;
      }
    }

    // reset
    setNombre("");
    setDensidad("");
    setCostoManual("");
    setItemId("");
    setPresentacionPref("");
    await loadAll();
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {error ? (
        <div style={{ padding: 10, borderRadius: 12, border: "1px solid rgba(255,0,0,0.35)", color: "tomato" }}>{error}</div>
      ) : null}

      <section style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 700 }}>Crear insumo</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Los insumos son los componentes de una fórmula. Se pueden costear por fuente manual o por item con presentación preferida obligatoria.
        </div>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 160px 200px" }}>
          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Nombre</div>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>UOM</div>
            <select
              value={tipoUom}
              onChange={(e) => setTipoUom(e.target.value as any)}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
            >
              <option value="GR">GR</option>
              <option value="ML">ML</option>
              <option value="UN">UN</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Densidad (g/mL) (si UOM=ML)</div>
            <input
              value={densidad}
              onChange={(e) => setDensidad(e.target.value)}
              placeholder="1.020"
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
            />
          </label>
        </div>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "240px 1fr 220px" }}>
          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Fuente</div>
            <select
              value={fuenteTipo}
              onChange={(e) => setFuenteTipo(e.target.value as any)}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
            >
              <option value="ITEM">Item (proveedor)</option>
              <option value="MANUAL">Manual</option>
            </select>
          </label>

          {fuenteTipo === "MANUAL" ? (
            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Costo por UOM (ARS)</div>
              <input
                value={costoManual}
                onChange={(e) => setCostoManual(e.target.value)}
                placeholder="ej: 0.15"
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
              />
            </label>
          ) : (
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 220px" }}>
              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Item</div>
                <select
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                  style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
                >
                  <option value="">Seleccionar...</option>
                  {items.map((it) => (
                    <option key={it.item_id} value={String(it.item_id)}>
                      #{it.item_id} - {it.proveedor_nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Presentación preferida</div>
                <input
                  value={presentacionPref}
                  onChange={(e) => setPresentacionPref(e.target.value)}
                  placeholder="ej: 1000"
                  style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
                />
              </label>
            </div>
          )}

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Prioridad</div>
            <input
              value={prioridad}
              onChange={(e) => setPrioridad(e.target.value)}
              placeholder="10"
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
            />
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={createInsumo}
            disabled={loading}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.06)" }}
          >
            Crear
          </button>
        </div>
      </section>

      <section style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700 }}>Insumos ({insumoCount})</div>
          <button
            onClick={loadAll}
            style={{ padding: "6px 8px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
          >
            Recargar
          </button>
        </div>

        <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", background: "rgba(255,255,255,0.04)" }}>
                <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Nombre</th>
                <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>UOM</th>
                <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Densidad</th>
                <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Activo</th>
              </tr>
            </thead>
            <tbody>
              {insumos.map((i) => (
                <tr key={i.insumo_id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <td style={{ padding: 10 }}>{i.nombre}</td>
                  <td style={{ padding: 10 }}>{i.tipo_uom}</td>
                  <td style={{ padding: 10 }}>{i.densidad_g_ml ?? "-"}</td>
                  <td style={{ padding: 10 }}>{i.activo ? "sí" : "no"}</td>
                </tr>
              ))}
              {!insumos.length ? (
                <tr>
                  <td colSpan={4} style={{ padding: 10, opacity: 0.75 }}>
                    Sin insumos.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
