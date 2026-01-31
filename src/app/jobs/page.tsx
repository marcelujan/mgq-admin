"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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

  // opcional: si el backend lo trae (join con item_seguimiento)
  url_canonica?: string | null;
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

function prettyNameFromUrl(url?: string | null) {
  if (!url) return "";
  const slug = url.split("/").filter(Boolean).pop() ?? "";
  return slug.replace(/[-_]+/g, " ").trim();
}

export default function JobsPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const [latestSucceeded, setLatestSucceeded] = useState(false);

  const [actingJobId, setActingJobId] = useState<number | null>(null);

  // panel crear job
  const [items, setItems] = useState<ItemRow[]>([]);
  const [itemsQ, setItemsQ] = useState("");
  const [itemsLoading, setItemsLoading] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);

  const [runningAll, setRunningAll] = useState(false);
  const [runAllCount, setRunAllCount] = useState(0);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "200");
      if (!latestSucceeded && estado) qs.set("estado", estado);
      if (latestSucceeded) qs.set("latest_succeeded", "1");

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
      const res = await fetch(`/api/jobs/run-next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ttl_seconds: 300 }),
      });
      const text = await res.text();
      const data = (() => {
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      })();
      if (!res.ok || !data?.ok) {
        throw new Error((data && (data.error || data.message)) || text || `HTTP ${res.status}`);
      }
      await load();
    } catch (e: any) {
      alert(e?.message || "Error ejecutando worker");
    }
  }

  async function runAllPending() {
    if (runningAll) return;
    setRunningAll(true);
    setRunAllCount(0);

    // corte de seguridad: evita loops infinitos si el backend siempre "claimed:true"
    const MAX = 100;

    try {
      for (let i = 0; i < MAX; i++) {
        const res = await fetch(`/api/jobs/run-next`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ttl_seconds: 300 }),
        });
        const text = await res.text();
        const data = (() => {
          try {
            return JSON.parse(text);
          } catch {
            return null;
          }
        })();
        if (!res.ok || !data?.ok) {
          throw new Error((data && (data.error || data.message)) || text || `HTTP ${res.status}`);
        }

        if (!data?.claimed) break;
        setRunAllCount((c) => c + 1);
      }
      await load();
    } catch (e: any) {
      alert(e?.message || "Error ejecutando jobs");
    } finally {
      setRunningAll(false);
    }
  }

  async function backfill(jobId: number) {
    setActingJobId(jobId);
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
      alert(e?.message || "Error ejecutando backfill");
    } finally {
      setActingJobId(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // al cambiar filtros/toggle, recargar
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, latestSucceeded]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return jobs;
    return jobs.filter((j) => {
      return (
        String(j.job_id).includes(needle) ||
        (j.tipo || "").toLowerCase().includes(needle) ||
        (j.estado || "").toLowerCase().includes(needle) ||
        String(j.item_id ?? "").includes(needle) ||
        (j.url_canonica || "").toLowerCase().includes(needle)
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

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            runNext();
          }}
          style={{ padding: "6px 10px" }}
          disabled={runningAll}
        >
          Run next job
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            runAllPending();
          }}
          style={{ padding: "6px 10px" }}
          disabled={runningAll}
        >
          {runningAll ? `Run all… (${runAllCount})` : "Run all pending"}
        </button>

        <label style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.95 }}>
          <input
            type="checkbox"
            checked={latestSucceeded}
            onChange={(e) => setLatestSucceeded(e.target.checked)}
          />
          Solo últimos SUCCEEDED
        </label>

        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          style={{ padding: "6px 10px" }}
          disabled={latestSucceeded}
          title={latestSucceeded ? "Desactivado cuando 'Solo últimos SUCCEEDED' está activo" : ""}
        >
          <option value="">(todos)</option>
          <option value="PENDING">PENDING</option>
          <option value="RUNNING">RUNNING</option>
          <option value="WAITING_REVIEW">WAITING_REVIEW</option>
          <option value="SUCCEEDED">SUCCEEDED</option>
          <option value="FAILED">FAILED</option>
          <option value="CANCELLED">CANCELLED</option>
        </select>

        <button type="button" onClick={load} style={{ padding: "6px 10px" }} disabled={loading}>
          Filtrar
        </button>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por id / tipo / estado / item_id / url"
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

          <button type="button"
            onClick={() => {
              const ids = items.map((x) => x.item_id);
              setSelectedItemIds((prev) => Array.from(new Set([...prev, ...ids])));
            }}
            style={{ padding: "6px 10px" }}
            disabled={items.length === 0}
          >
            Seleccionar visibles
          </button>

          <button type="button"
            onClick={() => setSelectedItemIds([])}
            style={{ padding: "6px 10px" }}
            disabled={selectedItemIds.length === 0}
          >
            Limpiar selección
          </button>

          <button type="button"
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
                const busy = actingJobId === j.job_id;

                const showReview = j.estado === "WAITING_REVIEW";
                const showBackfill = j.estado === "SUCCEEDED" && offers === 0;

                return (
                  <tr key={j.job_id}>
                    <td style={{ borderBottom: "1px solid #222" }}>
                      <Link href={`/jobs/${j.job_id}`}>{j.job_id}</Link>
                    </td>
                    <td style={{ borderBottom: "1px solid #222" }}>{j.estado}</td>
                    <td style={{ borderBottom: "1px solid #222" }}>{j.tipo}</td>

                    <td style={{ borderBottom: "1px solid #222", maxWidth: 520, wordBreak: "break-word" }}>
                      <div style={{ fontWeight: 600 }}>{prettyNameFromUrl(j.url_canonica) || ""}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        item_id: {j.item_id ?? ""} {j.url_canonica ? "•" : ""}{" "}
                        {j.url_canonica ? (
                          <a href={j.url_canonica} target="_blank" rel="noreferrer" style={{ opacity: 0.85 }}>
                            link
                          </a>
                        ) : null}
                      </div>
                    </td>

                    <td style={{ borderBottom: "1px solid #222" }}>{j.prioridad}</td>
                    <td style={{ borderBottom: "1px solid #222" }}>{j.next_run_at}</td>
                    <td style={{ borderBottom: "1px solid #222" }}>{j.locked_until ?? ""}</td>
                    <td style={{ borderBottom: "1px solid #222", maxWidth: 420, wordBreak: "break-word" }}>
                      {j.last_error ?? ""}
                    </td>
                    <td style={{ borderBottom: "1px solid #222", whiteSpace: "nowrap" }}>
                      {showReview ? (
                        <Link href={`/jobs/${j.job_id}`}>
                          <button type="button" style={{ padding: "6px 10px" }}>Revisar</button>
                        </Link>
                      ) : showBackfill ? (
                        <button type="button"
                          onClick={() => backfill(j.job_id)}
                          disabled={busy}
                          style={{ padding: "6px 10px" }}
                          title="Crea ofertas faltantes si el job quedó SUCCEEDED sin persistir ofertas (legado)"
                        >
                          {busy ? "Backfill..." : "Backfill"}
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
