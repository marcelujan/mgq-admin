"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Row = {
  publicacion_id: number;
  item_comercial_id: number;
  canal: string;
  titulo: string;
  precio_venta_ars: number | null;
  estado_publicacion: string;
  item_comercial_nombre?: string | null;
};

function colorFor(estado: string): string {
  switch ((estado || "").toUpperCase()) {
    case "PUBLICADA":
      return "#2ecc71";
    case "LISTA":
      return "#f1c40f";
    case "PAUSADA":
      return "#e74c3c";
    default:
      return "#9aa0a6";
  }
}

export default function PublicacionesClient() {
  const [items, setItems] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [canal, setCanal] = useState("");
  const [estado, setEstado] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const sp = new URLSearchParams();
      if (q.trim()) sp.set("q", q.trim());
      if (canal) sp.set("canal", canal);
      if (estado) sp.set("estado", estado);
      const r = await fetch(`/api/publicaciones?${sp.toString()}`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setItems(Array.isArray(j.items) ? j.items : []);
    } catch (e: any) {
      setErr(String(e?.message || "error"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [canal, estado]);

  const rows = useMemo(() => items, [items]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") load(); }}
          placeholder="Buscar..."
          style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", fontSize: 13, minWidth: 220 }}
        />
        <select
          value={canal}
          onChange={(e) => setCanal(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", fontSize: 13 }}
        >
          <option value="">Todos los canales</option>
          <option value="DIRECTO">DIRECTO</option>
          <option value="WEB">WEB</option>
          <option value="MERCADO_LIBRE">MERCADO_LIBRE</option>
        </select>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", fontSize: 13 }}
        >
          <option value="">Todos los estados</option>
          <option value="BORRADOR">Borrador</option>
          <option value="LISTA">Lista</option>
          <option value="PUBLICADA">Publicada</option>
          <option value="PAUSADA">Pausada</option>
        </select>
        <button
          onClick={load}
          style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", fontSize: 13, cursor: "pointer" }}
        >
          Buscar
        </button>
        <Link
          href="/publicaciones/new"
          style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", fontSize: 13, textDecoration: "none", color: "inherit" }}
        >
          Nuevo
        </Link>
      </div>

      {err ? <div style={{ color: "#ff8a80", fontSize: 13 }}>{err}</div> : null}

      <div style={{ overflowX: "auto", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.03)" }}>
              {["Publicación #","Canal","Item Comercial","Título","Precio","Estado","Acciones"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "6px 10px", borderBottom: "1px solid rgba(255,255,255,0.08)", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: "10px", opacity: 0.7 }}>Sin publicaciones.</td></tr>
            ) : null}
            {rows.map((it) => (
              <tr key={it.publicacion_id}>
                <td style={{ padding: "6px 10px", borderTop: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>#{it.publicacion_id}</td>
                <td style={{ padding: "6px 10px", borderTop: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>{it.canal}</td>
                <td title={it.item_comercial_nombre || ""} style={{ padding: "6px 10px", borderTop: "1px solid rgba(255,255,255,0.06)", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {it.item_comercial_nombre || `Item Comercial #${it.item_comercial_id}`}
                </td>
                <td title={it.titulo || ""} style={{ padding: "6px 10px", borderTop: "1px solid rgba(255,255,255,0.06)", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.titulo}</td>
                <td style={{ padding: "6px 10px", borderTop: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>{it.precio_venta_ars == null ? "—" : `$ ${Number(it.precio_venta_ars).toLocaleString("es-AR")}`}</td>
                <td style={{ padding: "6px 10px", borderTop: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: colorFor(it.estado_publicacion), display: "inline-block" }} />
                    <span>{it.estado_publicacion}</span>
                  </span>
                </td>
                <td style={{ padding: "6px 10px", borderTop: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>
                  <Link href={`/publicaciones/${it.publicacion_id}`} style={{ color: "inherit", textDecoration: "none" }}>✏️</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
