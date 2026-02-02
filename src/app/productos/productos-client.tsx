"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Producto = { producto_id: number; nombre: string; activo: boolean; updated_at?: string };

export default function ProductosClient() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/productos?limit=200&search=${encodeURIComponent(search)}`, { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "error");
      setProductos(j.productos || []);
    } catch (e: any) {
      setError(e?.message ?? "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Productos</h2>
        <Link href="/productos/new">Crear</Link>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="buscar..." />
        <button onClick={load} disabled={loading}>
          Buscar
        </button>
        {loading && <span style={{ opacity: 0.7 }}>cargando...</span>}
      </div>

      {error && <div style={{ marginTop: 10, color: "crimson" }}>{error}</div>}

      <div style={{ marginTop: 14 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>ID</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Nombre</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>Activo</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.producto_id}>
                <td style={{ padding: "6px 0" }}>{p.producto_id}</td>
                <td>
                  <Link href={`/productos/${p.producto_id}`}>{p.nombre}</Link>
                </td>
                <td>{p.activo ? "sí" : "no"}</td>
              </tr>
            ))}
            {productos.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: 10, opacity: 0.7 }}>
                  No hay productos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
