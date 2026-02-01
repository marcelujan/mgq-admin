"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ProductoRow = {
  producto_id: number;
  nombre: string;
  categoria: string | null;
  densidad_producto_g_ml: number | null;
  activo: boolean;
  tiene_base: boolean;
  tiene_formula: boolean;
  updated_at: string;
};

export default function ProductosClient() {
  const [rows, setRows] = useState<ProductoRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (r.nombre || "").toLowerCase().includes(q));
  }, [rows, search]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/productos?limit=200&offset=0`, { cache: "no-store" });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || "error");
      setRows(data.productos || []);
    } catch (e: any) {
      setError(e?.message || "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre"
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.03)",
            width: 320,
          }}
        />
        <button
          onClick={load}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          Refrescar
        </button>
        {loading ? <span style={{ fontSize: 12, opacity: 0.75 }}>Cargando...</span> : null}
        {error ? <span style={{ fontSize: 12, color: "tomato" }}>{error}</span> : null}
      </div>

      <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", background: "rgba(255,255,255,0.04)" }}>
              <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Producto</th>
              <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Tipo</th>
              <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Densidad</th>
              <th style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>Activo</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const tipo = r.tiene_formula ? "Formulado" : r.tiene_base ? "Simple" : "Sin definir";
              return (
                <tr key={r.producto_id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <td style={{ padding: 10 }}>
                    <Link href={`/productos/${r.producto_id}`} style={{ textDecoration: "underline" }}>
                      {r.nombre}
                    </Link>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>#{r.producto_id}</div>
                  </td>
                  <td style={{ padding: 10 }}>{tipo}</td>
                  <td style={{ padding: 10 }}>{r.densidad_producto_g_ml ?? "-"}</td>
                  <td style={{ padding: 10 }}>{r.activo ? "Sí" : "No"}</td>
                </tr>
              );
            })}
            {!filtered.length ? (
              <tr>
                <td colSpan={4} style={{ padding: 10, opacity: 0.75 }}>
                  Sin resultados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
