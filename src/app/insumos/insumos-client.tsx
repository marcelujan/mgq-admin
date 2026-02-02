"use client";

import { useEffect, useMemo, useState } from "react";

type Insumo = {
  insumo_id: number;
  nombre: string;
  tipo_uom: "GR" | "ML" | "UN";
  densidad_g_ml: number | null;
  activo: boolean;
};

type Item = { item_id: number; nombre: string; proveedor?: string | null };

export default function InsumosClient() {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [tipoUom, setTipoUom] = useState<"GR" | "ML" | "UN">("GR");
  const [densidad, setDensidad] = useState<string>("");

  const [fuenteTipo, setFuenteTipo] = useState<"MANUAL" | "ITEM">("MANUAL");
  const [costoManual, setCostoManual] = useState<string>("");
  const [itemId, setItemId] = useState<string>("");
  const [presentacionPreferida, setPresentacionPreferida] = useState<string>("");

  const [itemsSuggest, setItemsSuggest] = useState<Item[]>([]);
  const [itemSearch, setItemSearch] = useState("");

  async function loadInsumos() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/insumos?limit=500", { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Error cargando insumos");
      setInsumos(j.insumos || []);
    } catch (e: any) {
      setError(e?.message ?? "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInsumos();
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      const q = itemSearch.trim();
      if (!q) {
        setItemsSuggest([]);
        return;
      }
      try {
        // Reusa tu API de items si existe: /api/items?search=
        const r = await fetch(`/api/items?search=${encodeURIComponent(q)}&limit=20`, { cache: "no-store" });
        const j = await r.json();
        if (j.ok && Array.isArray(j.items)) setItemsSuggest(j.items);
        else setItemsSuggest([]);
      } catch {
        setItemsSuggest([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [itemSearch]);

  async function crearInsumo() {
    setError(null);
    try {
      const dens = densidad.trim() ? Number(densidad) : null;
      const r1 = await fetch("/api/insumos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nombre,
          tipo_uom: tipoUom,
          densidad_g_ml: dens,
          activo: true,
        }),
      });
      const j1 = await r1.json();
      if (!j1.ok) throw new Error(j1.error || "No se pudo crear insumo");
      const newId = j1.insumo_id as number;

      if (fuenteTipo === "MANUAL") {
        const c = Number(costoManual);
        const r2 = await fetch(`/api/insumos/${newId}/fuentes`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tipo: "MANUAL",
            costo_por_uom_ars: c,
            prioridad: 10,
            habilitada: true,
          }),
        });
        const j2 = await r2.json();
        if (!j2.ok) throw new Error(j2.error || "No se pudo crear fuente manual");
      } else {
        const it = Number(itemId);
        const pref = Number(presentacionPreferida);
        const r2 = await fetch(`/api/insumos/${newId}/fuentes`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tipo: "ITEM",
            item_id: it,
            presentacion_preferida: pref,
            prioridad: 10,
            habilitada: true,
          }),
        });
        const j2 = await r2.json();
        if (!j2.ok) throw new Error(j2.error || "No se pudo crear fuente ITEM");
      }

      setNombre("");
      setDensidad("");
      setCostoManual("");
      setItemId("");
      setPresentacionPreferida("");
      setItemSearch("");
      setItemsSuggest([]);
      await loadInsumos();
    } catch (e: any) {
      setError(e?.message ?? "error");
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginTop: 0 }}>Insumos</h2>

      <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Crear insumo</h3>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 140px", gap: 8 }}>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" />
          <select value={tipoUom} onChange={(e) => setTipoUom(e.target.value as any)}>
            <option value="GR">GR</option>
            <option value="ML">ML</option>
            <option value="UN">UN</option>
          </select>
          <input
            value={densidad}
            onChange={(e) => setDensidad(e.target.value)}
            placeholder="Densidad g/mL (si UOM=ML)"
          />
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={{ marginRight: 8 }}>Fuente:</label>
          <select value={fuenteTipo} onChange={(e) => setFuenteTipo(e.target.value as any)}>
            <option value="MANUAL">Manual</option>
            <option value="ITEM">Desde item (cron)</option>
          </select>
        </div>

        {fuenteTipo === "MANUAL" ? (
          <div style={{ marginTop: 8 }}>
            <input
              value={costoManual}
              onChange={(e) => setCostoManual(e.target.value)}
              placeholder="Costo por UOM (ARS)"
              style={{ width: 240 }}
            />
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 200px 220px", gap: 8 }}>
              <input value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="Buscar item..." />
              <input value={itemId} onChange={(e) => setItemId(e.target.value)} placeholder="item_id" />
              <input
                value={presentacionPreferida}
                onChange={(e) => setPresentacionPreferida(e.target.value)}
                placeholder="presentación preferida (obligatoria)"
              />
            </div>
            {itemsSuggest.length > 0 && (
              <div style={{ border: "1px solid #eee", marginTop: 8, padding: 8, borderRadius: 6 }}>
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Sugerencias:</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {itemsSuggest.map((it) => (
                    <li key={it.item_id}>
                      <button
                        onClick={() => {
                          setItemId(String(it.item_id));
                          setItemsSuggest([]);
                        }}
                      >
                        usar
                      </button>{" "}
                      <span style={{ marginLeft: 8 }}>
                        #{it.item_id} {it.nombre}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 10 }}>
          <button onClick={crearInsumo} disabled={!nombre.trim()}>
            Crear
          </button>
        </div>

        {error && <div style={{ marginTop: 10, color: "crimson" }}>{error}</div>}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Lista</h3>
        <button onClick={loadInsumos} disabled={loading}>
          Recargar
        </button>
        <span style={{ opacity: 0.7 }}>{loading ? "cargando..." : `${insumos.length} insumos`}</span>
      </div>

      <div style={{ marginTop: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>ID</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Nombre</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>UOM</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Densidad</th>
            </tr>
          </thead>
          <tbody>
            {insumos.map((i) => (
              <tr key={i.insumo_id}>
                <td style={{ padding: "6px 0" }}>{i.insumo_id}</td>
                <td>{i.nombre}</td>
                <td>{i.tipo_uom}</td>
                <td>{i.densidad_g_ml ?? ""}</td>
              </tr>
            ))}
            {insumos.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 10, opacity: 0.7 }}>
                  No hay insumos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
