"use client";

import Link from "next/link";
import { type CSSProperties, useEffect, useMemo, useState } from "react";

type JobRow = {
  job_id: number;
  tipo: string;
  estado: string;
  prioridad: number;
  proveedor_id: number | null;
  motor_id: number | null;
  item_id: number | null;
  corrida_id: number | null;
  next_run_at: string | null;
  locked_until: string | null;
  last_error: string | null;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  updated_at: string;

  // enrich desde /api/jobs
  url_canonica?: string | null;
  proveedor_codigo?: string | null;
  proveedor_nombre?: string | null;
  warnings_count?: number | null;
  errors_count?: number | null;
  valid_count?: number | null;
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

function fmtIso(ts?: string | null) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function shortUrl(u?: string | null) {
  if (!u) return "";
  try {
    const url = new URL(u);
    const path = url.pathname.replace(/\/+$/, "");
    const tail = path.split("/").filter(Boolean).slice(-1)[0] || url.hostname;
    return tail.length > 48 ? tail.slice(0, 45) + "…" : tail;
  } catch {
    return u.length > 48 ? u.slice(0, 45) + "…" : u;
  }
}

function badgeStyle(estado: string) {
  const s = estado || "";
  const base: CSSProperties = {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.18)",
    fontSize: 12,
    lineHeight: "16px",
    letterSpacing: 0.2,
  };

  if (s === "SUCCEEDED") return { ...base, background: "rgba(34,197,94,0.15)", borderColor: "rgba(34,197,94,0.35)" };
  if (s === "WAITING_REVIEW") return { ...base, background: "rgba(250,204,21,0.14)", borderColor: "rgba(250,204,21,0.35)" };
  if (s === "FAILED") return { ...base, background: "rgba(239,68,68,0.14)", borderColor: "rgba(239,68,68,0.35)" };
  if (s === "RUNNING") return { ...base, background: "rgba(59,130,246,0.14)", borderColor: "rgba(59,130,246,0.35)" };
  if (s === "PENDING") return { ...base, background: "rgba(255,255,255,0.06)" };
  return base;
}

export default function JobsPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const [onlyLatestSucceeded, setOnlyLatestSucceeded] = useState(false);
  const [runningAll, setRunningAll] = useState(false);

  // panel crear job
  const [items, setItems] = useState<ItemRow[]>([]);
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

      if (onlyLatestSucceeded) {
        qs.set("latest_succeeded", "1");
      } else if (estado) {
        qs.set("estado", estado);
      }

      const res = await fetch(`/api/jobs?${qs.toString()}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch (e: any) {
      setErr(e?.message || "Error cargando jobs");
    } finally {
      setLoading(false);
    }
  }

  async function runNext() {
    try {
      const res = await fetch(`/api/jobs/run-next`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await load();
    } catch (e: any) {
      alert(e?.message || "Error ejecutando job");
    }
  }

  async function runAllPending() {
    if (runningAll) return;
    setRunningAll(true);
    try {
      // Loop con corte para evitar loops infinitos.
      // run-next devuelve { ok:true, claimed:false } cuando ya no hay PENDING.
      for (let i = 0; i < 100; i++) {
        const res = await fetch(`/api/jobs/run-next`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        if (data?.claimed === false) break;
      }
      await load();
    } catch (e: any) {
      alert(e?.message || "Error ejecutando jobs");
    } finally {
      setRunningAll(false);
    }
  }

  async function loadItems() {
    setItemsLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "50");
      if (itemsQ.trim()) qs.set("search", itemsQ.trim());

      const res = await fetch(`/api/items?${qs.toString()}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
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

  useEffect(() => {
    // recargar al cambiar toggle/filtro
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, onlyLatestSucceeded]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return jobs;
    return jobs.filter((j) => {
      const prov = `${j.proveedor_codigo || ""} ${j.proveedor_nombre || ""}`.toLowerCase();
      const url = (j.url_canonica || "").toLowerCase();
      return (
        String(j.job_id).includes(needle) ||
        (j.tipo || "").toLowerCase().includes(needle) ||
        (j.estado || "").toLowerCase().includes(needle) ||
        String(j.item_id ?? "").includes(needle) ||
        prov.includes(needle) ||
        url.includes(needle)
      );
    });
  }, [jobs, q]);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif", color: "rgba(255,255,255,0.92)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Jobs manual</h1>

        <button type="button" onClick={load} disabled={loading} style={{ padding: "6px 10px" }}>
          {loading ? "Cargando..." : "Refrescar"}
        </button>

        <button type="button" onClick={runNext} style={{ padding: "6px 10px" }} disabled={runningAll}>
          Run next job
        </button>

        <button type="button" onClick={runAllPending} style={{ padding: "6px 10px" }} disabled={runningAll}>
          {runningAll ? "Running..." : "Run all pending"}
        </button>

        <label style={{ display: "flex", alignItems: "center", gap: 8, userSelect: "none" }}>
          <input
            type="checkbox"
            checked={onlyLatestSucceeded}
            onChange={(e) => setOnlyLatestSucceeded(e.target.checked)}
          />
          Solo últimos SUCCEEDED
        </label>

        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          style={{ padding: "6px 10px" }}
          disabled={onlyLatestSucceeded}
          title={onlyLatestSucceeded ? "Deshabilitado cuando está activo 'Solo últimos SUCCEEDED'" : ""}
        >
          <option value="">(todos)</option>
          <option value="PENDING">PENDING</option>
          <option value="RUNNING">RUNNING</option>
          <option value="WAITING_REVIEW">WAITING_REVIEW</option>
          <option value="SUCCEEDED">SUCCEEDED</option>
          <option value="FAILED">FAILED</option>
          <option value="CANCELLED">CANCELLED</option>
        </select>

        <button type="button" onClick={load} style={{ padding: "6px 10px" }}>
          Filtrar
        </button>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por id / tipo / estado / item_id / proveedor / url"
          style={{ flex: 1, padding: "6px 10px" }}
        />
      </div>

      {/* Panel crear job */}
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

          <button type="button" onClick={loadItems} disabled={itemsLoading} style={{ padding: "6px 10px" }}>
            {itemsLoading ? "Buscando..." : "Buscar"}
          </button>

          <button
            type="button"
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
            type="button"
            onClick={() => setSelectedItemIds([])}
            style={{ padding: "6px 10px" }}
            disabled={selectedItemIds.length === 0}
          >
            Limpiar selección
          </button>

          <button
            type="button"
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
                {[
                  "job_id",
                  "estado",
                  "tipo",
                  "artículo",
                  "proveedor",
                  "motor",
                  "prioridad",
                  "terminó",
                  "warn/err",
                  "locked_until",
                  "last_error",
                  "actions",
                ].map((h) => (
                  <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #333" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((j) => {
                const url = j.url_canonica || null;
                const prov = j.proveedor_nombre || j.proveedor_codigo || "";
                const warn = Number(j.warnings_count ?? 0);
                const errc = Number(j.errors_count ?? 0);

                return (
                  <tr key={j.job_id}>
                    <td style={{ borderBottom: "1px solid #222", whiteSpace: "nowrap" }}>
                      <Link href={`/jobs/${j.job_id}`}>{j.job_id}</Link>
                    </td>

                    <td style={{ borderBottom: "1px solid #222" }}>
                      <span style={badgeStyle(j.estado)}>{j.estado}</span>
                    </td>

                    <td style={{ borderBottom: "1px solid #222" }}>{j.tipo}</td>

                    <td style={{ borderBottom: "1px solid #222", maxWidth: 320 }} title={url || undefined}>
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
                          {shortUrl(url)}
                        </a>
                      ) : (
                        <span style={{ opacity: 0.75 }}>item_id: {j.item_id ?? ""}</span>
                      )}
                    </td>

                    <td style={{ borderBottom: "1px solid #222" }} title={prov || undefined}>
                      {prov || ""}
                    </td>

                    <td style={{ borderBottom: "1px solid #222" }}>{j.motor_id ?? ""}</td>

                    <td style={{ borderBottom: "1px solid #222" }}>{j.prioridad}</td>

                    <td style={{ borderBottom: "1px solid #222", whiteSpace: "nowrap" }}>
                      {fmtIso(j.finished_at || null) || fmtIso(j.updated_at)}
                    </td>

                    <td style={{ borderBottom: "1px solid #222", whiteSpace: "nowrap" }}>
                      {(warn || errc) ? (
                        <span title={`warnings: ${warn} | errors: ${errc}`}>{warn}/{errc}</span>
                      ) : (
                        ""
                      )}
                    </td>

                    <td style={{ borderBottom: "1px solid #222", whiteSpace: "nowrap" }}>{fmtIso(j.locked_until)}</td>

                    <td
                      style={{ borderBottom: "1px solid #222", maxWidth: 420, wordBreak: "break-word" }}
                      title={j.last_error || undefined}
                    >
                      {j.last_error ? (j.last_error.length > 140 ? j.last_error.slice(0, 140) + "…" : j.last_error) : ""}
                    </td>

                    <td style={{ borderBottom: "1px solid #222", whiteSpace: "nowrap" }}>
                      {j.estado === "WAITING_REVIEW" ? (
                        <Link href={`/jobs/${j.job_id}`} style={{ padding: "6px 10px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6 }}>
                          Revisar
                        </Link>
                      ) : j.estado === "SUCCEEDED" ? (
                        <Link href={`/jobs/${j.job_id}`} style={{ padding: "6px 10px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, opacity: 0.85 }}>
                          Ver
                        </Link>
                      ) : (
                        <span style={{ opacity: 0.5 }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} style={{ padding: 12 }}>
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
