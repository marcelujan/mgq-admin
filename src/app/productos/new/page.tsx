"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ProductoNewPage() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [densidad, setDensidad] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    const n = nombre.trim();
    if (!n) {
      setError("Nombre requerido");
      return;
    }
    let d: number | null = null;
    if (densidad.trim()) {
      const x = Number(densidad);
      if (!Number.isFinite(x) || x <= 0) {
        setError("Densidad inválida");
        return;
      }
      d = x;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/productos`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nombre: n, densidad_producto_g_ml: d }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      router.push(`/productos/${j.producto_id}`);
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 12, maxWidth: 720 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Nuevo producto</h1>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Crear entidad comercial (simple o formulada)</div>
        </div>
        <Link href="/productos" style={{ opacity: 0.85 }}>
          Volver
        </Link>
      </div>

      <div style={{ display: "grid", gap: 10, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Nombre</div>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Shampoo base"
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Densidad del producto (g/mL) (opcional)</div>
          <input
            value={densidad}
            onChange={(e) => setDensidad(e.target.value)}
            placeholder="Ej: 1.020"
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
          />
        </label>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={create}
            disabled={loading}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
          >
            {loading ? "Creando..." : "Crear"}
          </button>
          {error ? <span style={{ color: "tomato", fontSize: 12 }}>{error}</span> : null}
        </div>
      </div>
    </div>
  );
}
