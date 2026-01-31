"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";


function prettyNameFromUrl(url?: string) {
  if (!url) return "";
  try {
    const clean = url.split("?")[0].split("#")[0];
    const parts = clean.split("/").filter(Boolean);
    const slug = parts[parts.length - 1] ?? "";
    return slug.replace(/-/g, " ").trim();
  } catch {
    return "";
  }
}

type JobRow = {
  job_id: number;
  tipo: string;
  estado: string;
  prioridad: number;
  proveedor_id: number | null;
  motor_id: number | null;
  item_id: number | null;
  corrida_id: number | null;
  next_run_at: string;
  locked_until: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  ofertas_count?: number;
};

type ItemRow = {
  item_id: number;
  proveedor_id: number | null;
  motor_id: number | null;
  estado: string;
  seleccionado?: boolean;
  url_canonica: string;
  updated_at: string;
};

export default function JobsPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const [approvingJobId, setApprovingJobId] = useState<number | null>(null);

  // panel crear job
  const [items, setItems] = useState<ItemRow[]>([]);

const itemUrlById = useMemo(() => {
  const m = new Map<number, string>();
  for (const it of items) m.set(it.item_id, it.url_canonica);
  return m;
}, [items]);


  const [itemsQ, setItemsQ] = useState("");
  const [itemsLoading, setItemsLoading] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "200");
      if (estado) qs.set("estado", estado);

      const res = await fetch(`/api/jobs?${qs.toString()}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      // IMPORTANTE: /api/jobs devuelve { ok:true, jobs: rows }
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch (e: any) {
      setErr(e?.message || "Error cargando jobs");
    } finally {
      setLoading(false);
    }
  }

  async function runNext() {
    try {
      const res = await fetch(`/api/jobs/run-next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ttl_seconds: 300 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await load();
    } catch (e: any) {
      alert(e?.message || "Error ejecutando worker");
    }
  }

  async function approve(jobId: number) {
    setApprovingJobId(jobId);
    try {
      const res = await fetch(`/api/jobs/${jobId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });

      const text = await res.text();
      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }

      if (!res.ok || (parsed && !parsed?.ok)) {
        throw new Error((parsed && (parsed.error || parsed.message)) || text || `HTTP ${res.status}`);
      }

      await load();
    } catch (e: any) {
      alert(e?.message || "Error aprobando job");
    } finally {
      setApprovingJobId(null);
    }
  }

  async function loadItems() {
    setItemsLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "50");
      if (itemsQ.trim()) qs.set("search", itemsQ.trim()); // /api/items usa search

      const res = await fetch(`/api/items?${qs.toString()}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      // En tu app /api/items suele devolver items o rows según versión.
      // Soportamos ambos para no romper.
      const list = Array.isArray(data.items) ? data.items : Array.isArray(data.rows) ? data.rows : [];
      setItems(list);
    } catch (e: any) {
      alert(e?.message || "Error cargando items");
    } finally {
      setItemsLoading(false);
    }
  }

  async function createJobsForSelected() {
    const ids = selectedItemIds.slice();
    if (ids.length === 0) {
      alert("Seleccioná al menos un item");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`/api/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_ids: ids, prioridad: 100 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setSelectedItemIds([]);
      await load();
    } catch (e: any) {
      alert(e?.message || "Error creando jobs");
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    load();
    loadItems();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return jobs;
    return jobs.filter((j) => {
      return (
        String(j.job_id).includes(needle) ||
        (j.tipo || "").toLowerCase().includes(needle) ||
        (j.estado || "").toLowerCase().includes(needle) ||
        String(j.item_id ?? "").includes(needle)
      );
    });
  }, [jobs, q]);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif", color: "rgba(255,255,255,0.92)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Jobs manual</h1>

        <button onClick={load} disabled={loading} style={{ padding: "6px 10px" }}>
          {loading ? "Cargando..." : "Refrescar"}
        </button>

        <button onClick={runNext} style={{ padding: "6px 10px" }}>
          Run next job
        </button>

        <select value={estado} onChange={(e) => setEstado(e.target.value)} style={{ padding: "6px 10px" }}>
          <option value="">(todos)</option>
          <option value="PENDING">PENDING</option>
          <option value="RUNNING">RUNNING</option>
          <option value="WAITING_REVIEW">WAITING_REVIEW</option>
          <option value="SUCCEEDED">SUCCEEDED</option>
          <option value="FAILED">FAILED</option>
          <option value="CANCELLED">CANCELLED</option>
        </select>

        <button onClick={load} style={{ padding: "6px 10px" }}>
          Filtrar
        </button>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por id / tipo / estado / item_id"
          style={{ flex: 1, padding: "6px 10px" }}
        />
      </div>

      {/* Panel crear job (ubicación correcta: entre toolbar y tabla) */}
      <div
        style={{
          marginBottom: 14,
          padding: 12,
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 12,
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Crear job manual (por item_id)</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={itemsQ}
            onChange={(e) => setItemsQ(e.target.value)}
            placeholder="Buscar items (url / proveedor / id)"
            style={{ flex: "1 1 420px", padding: "6px 10px" }}
          />

          <button onClick={loadItems} disabled={itemsLoading} style={{ padding: "6px 10px" }}>
            {itemsLoading ? "Buscando..." : "Buscar"}
          </button>

          <button
            onClick={() => {
              const ids = items.map((x) => x.item_id);
              setSelectedItemIds((prev) => Array.from(new Set([...prev, ...ids])));
            }}
            style={{ padding: "6px 10px" }}
            disabled={items.length === 0}
          >
            Seleccionar visibles
          </button>

          <button
            onClick={() => setSelectedItemIds([])}
            style={{ padding: "6px 10px" }}
            disabled={selectedItemIds.length === 0}
          >
            Limpiar selección
          </button>

          <button
            onClick={createJobsForSelected}
            disabled={creating || selectedItemIds.length === 0}
            style={{ padding: "6px 10px" }}
          >
            {creating ? "Creando..." : `Crear jobs (${selectedItemIds.length})`}
          </button>
        </div>

        <div
          style={{
            marginTop: 10,
            maxHeight: 260,
            overflow: "auto",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10,
          }}
        >
          <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.10)", width: 48 }} />
                <th style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.10)", width: 80 }}>
                  item_id
                </th>
                <th style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>url</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.10)", width: 120 }}>
                  estado
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const checked = selectedItemIds.includes(it.item_id);
                return (
                  <tr key={it.item_id}>
                    <td style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedItemIds((prev) => Array.from(new Set([...prev, it.item_id])));
                          } else {
                            setSelectedItemIds((prev) => prev.filter((x) => x !== it.item_id));
                          }
                        }}
                      />
                    </td>
                    <td style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{it.item_id}</td>
                    <td
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                        maxWidth: 520,
                        wordBreak: "break-word",
                      }}
                      title={it.url_canonica}
                    >
                      {it.url_canonica}
                    </td>
                    <td style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{it.estado}</td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 12, opacity: 0.8 }}>
                    {itemsLoading ? "Cargando..." : "Sin items (usá Buscar)"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
                {["job_id", "estado", "tipo", "artículo", "prioridad", "next_run_at", "locked_until", "last_error", "actions"].map(
                  (h) => (
                    <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #333" }}>
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((j) => {
                const offers = Number(j.ofertas_count ?? 0);
                const canReview = j.estado === "WAITING_REVIEW";
                const canBackfill = j.estado === "SUCCEEDED" && offers === 0;
                const busy = approvingJobId === j.job_id;

                return (
                  <tr key={j.job_id}>
                    <td style={{ borderBottom: "1px solid #222" }}>
                      <Link href={`/jobs/${j.job_id}`}>{j.job_id}</Link>
                    </td>
                    <td style={{ borderBottom: "1px solid #222" }}>{j.estado}</td>
                    <td style={{ borderBottom: "1px solid #222" }}>{j.tipo}</td>
                    <td style={{ borderBottom: "1px solid #222", maxWidth: 380 }}>
                  <div title={j.item_id != null ? itemUrlById.get(j.item_id) ?? "" : ""} style={{ fontWeight: 600 }}>
                    {(() => {
                      const u = j.item_id != null ? itemUrlById.get(j.item_id) : undefined;
                      const name = prettyNameFromUrl(u);
                      return name || "";
                    })()}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>item_id: {j.item_id ?? ""}</div>
                </td>
                    <td style={{ borderBottom: "1px solid #222" }}>{j.prioridad}</td>
                    <td style={{ borderBottom: "1px solid #222" }}>{j.next_run_at}</td>
                    <td style={{ borderBottom: "1px solid #222" }}>{j.locked_until ?? ""}</td>
                    <td style={{ borderBottom: "1px solid #222", maxWidth: 420, wordBreak: "break-word" }}>
                      {j.last_error ?? ""}
                    </td>
                    <td style={{ borderBottom: "1px solid #222", whiteSpace: "nowrap" }}>
                      {canReview ? (
                        <Link href={`/jobs/${j.job_id}`} style={{ padding: "6px 10px", display: "inline-block", border: "1px solid #333", borderRadius: 6 }}>
                          Revisar
                        </Link>
                      ) : canBackfill ? (
                        <button
                          onClick={() => approve(j.job_id)}
                          disabled={busy}
                          style={{ padding: "6px 10px" }}
                          title="Crea ofertas faltantes si el job quedó SUCCEEDED sin persistirlas (caso legado)"
                        >
                          Backfill
                        </button>
                      ) : (
                        <span style={{ opacity: 0.5 }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}

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
