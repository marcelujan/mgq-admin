"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ItemRow = {
  item_id: number;
  proveedor_id: number;
  motor_id: number;
  url_original: string;
  url_canonica: string;
  seleccionado: boolean;
  estado: string;
  updated_at: string;
  created_at: string;
  last_job_id?: number | null;
  last_job_estado?: string | null;
};

export default function ItemsPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/items?limit=50&offset=0`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setItems(data.items ?? []);
    } catch (e: any) {
      setErr(e?.message || "Error cargando items");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((it) => {
      return (
        String(it.item_id).includes(needle) ||
        (it.url_original || "").toLowerCase().includes(needle) ||
        (it.url_canonica || "").toLowerCase().includes(needle) ||
        String(it.proveedor_id).includes(needle) ||
        String(it.motor_id).includes(needle) ||
        (it.estado || "").toLowerCase().includes(needle)
      );
    });
  }, [items, q]);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Items</h1>
        <button onClick={load} disabled={loading} style={{ padding: "6px 10px" }}>
          {loading ? "Cargando..." : "Refrescar"}
        </button>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por id / url / estado..."
          style={{ flex: 1, padding: "6px 10px" }}
        />
      </div>

      {err && (
        <div style={{ marginBottom: 12, padding: 10, border: "1px solid #c00" }}>
          <b>Error:</b> {err}
        </div>
      )}

      {loading ? (
        <div>Cargando...</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {[
                  "item_id",
                  "proveedor_id",
                  "motor_id",
                  "estado",
                  "seleccionado",
                  "url_canonica",
                  "updated_at",
                  "last_job_id",
                  "last_job_estado",
                ].map((h) => (
                  <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #333" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.item_id}>
                  {/* LINK: /items/{item_id} */}
                  <td style={{ borderBottom: "1px solid #222" }}>
                    <Link
                      href={`/items/${it.item_id}`}
                      style={{ textDecoration: "underline", color: "inherit" }}
                      title={`Ver detalle / histórico de item ${it.item_id}`}
                    >
                      {it.item_id}
                    </Link>
                  </td>

                  <td style={{ borderBottom: "1px solid #222" }}>{it.proveedor_id}</td>
                  <td style={{ borderBottom: "1px solid #222" }}>{it.motor_id}</td>
                  <td style={{ borderBottom: "1px solid #222" }}>{it.estado}</td>
                  <td style={{ borderBottom: "1px solid #222" }}>{it.seleccionado ? "true" : "false"}</td>
                  <td style={{ borderBottom: "1px solid #222", maxWidth: 520, wordBreak: "break-all" }}>
                    {it.url_canonica}
                  </td>
                  <td style={{ borderBottom: "1px solid #222" }}>{it.updated_at}</td>
                  <td style={{ borderBottom: "1px solid #222" }}>{it.last_job_id ?? ""}</td>
                  <td style={{ borderBottom: "1px solid #222" }}>{it.last_job_estado ?? ""}</td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: 12 }}>
                    Sin resultados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
