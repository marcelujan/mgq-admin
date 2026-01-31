"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ItemRow = {
  item_id: number;
  proveedor_id: number | null;
  motor_id: number | null;
  estado: string;
  seleccionado: boolean;
  url_canonica: string;
  updated_at: string;
};

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
  ofertas_count?: number; // nuevo
};

export default function JobsPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [itemsQ, setItemsQ] = useState("");
  const [itemsLoading, setItemsLoading] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);

  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const [approvingJobId, setApprovingJobId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "200");
      if (estado) qs.set("estado", estado);
      const res = await fetch(`/api/jobs?${qs.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setJobs(data.jobs ?? []);
    } catch (e: any) {
      setErr(e?.message || "Error cargando jobs");
    } finally {
      setLoading(false);
    }
  }

  
  async function loadItems() {
    setItemsLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "50");
      if (itemsQ.trim()) qs.set("search", itemsQ.trim());
      const res = await fetch(`/api/items?${qs.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setItems(data.items ?? []);
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
async function runNext() {
    try {
      const res = await fetch(`/api/jobs/run-next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ttl_seconds: 300 }),
      });
      const data = await res.json();
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
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
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
      

      <div style={{ marginBottom: 14, padding: 12, border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Crear job manual (por item_id)</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={itemsQ}
            onChange={(e) => setItemsQ(e.target.value)}
            placeholder="Buscar items (url / proveedor / id)"
            style={{ flex: "1 1 320px", padding: "6px 10px" }}
          />
          <button onClick={loadItems} disabled={itemsLoading} style={{ padding: "6px 10px" }}>
            {itemsLoading ? "Buscando..." : "Buscar"}
          </button>
          <button
            onClick={() => {
              // seleccionar todos los visibles
              const ids = items.map((x) => x.item_id);
              setSelectedItemIds(Array.from(new Set([...selectedItemIds, ...ids])));
            }}
            style={{ padding: "6px 10px" }}
            disabled={items.length === 0}
          >
            Seleccionar visibles
          </button>
          <button onClick={() => setSelectedItemIds([])} style={{ padding: "6px 10px" }} disabled={selectedItemIds.length === 0}>
            Limpiar selección
          </button>
          <button onClick={createJobsForSelected} disabled={creating || selectedItemIds.length === 0} style={{ padding: "6px 10px" }}>
            {creating ? "Creando..." : `Crear jobs (${selectedItemIds.length})`}
          </button>
        </div>

        <div style={{ marginTop: 10, maxHeight: 260, overflow: "auto", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10 }}>
          <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.10)", width: 48 }}></th>
                <th style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.10)", width: 80 }}>item_id</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>url</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.10)", width: 120 }}>estado</th>
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
                          if (e.target.checked) setSelectedItemIds((prev) => Array.from(new Set([...prev, it.item_id])));
                          else setSelectedItemIds((prev) => prev.filter((x) => x !== it.item_id));
                        }}
                      />
                    </td>
                    <td style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{it.item_id}</td>
                    <td style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", maxWidth: 520, wordBreak: "break-word" }}>
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
                {["job_id", "estado", "tipo", "item_id", "prioridad", "next_run_at", "locked_until", "last_error", "actions"].map(
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
                const canApproveByStatus = j.estado === "WAITING_REVIEW" || j.estado === "SUCCEEDED";
                const canApprove = canApproveByStatus && offers === 0;
                const busy = approvingJobId === j.job_id;

                return (
                  <tr key={j.job_id}>
                    <td style={{ borderBottom: "1px solid #222" }}>
                      <Link href={`/jobs/${j.job_id}`}>{j.job_id}</Link>
                    </td>
                    <td style={{ borderBottom: "1px solid #222" }}>{j.estado}</td>
                    <td style={{ borderBottom: "1px solid #222" }}>{j.tipo}</td>
                    <td style={{ borderBottom: "1px solid #222" }}>{j.item_id ?? ""}</td>
                    <td style={{ borderBottom: "1px solid #222" }}>{j.prioridad}</td>
                    <td style={{ borderBottom: "1px solid #222" }}>{j.next_run_at}</td>
                    <td style={{ borderBottom: "1px solid #222" }}>{j.locked_until ?? ""}</td>
                    <td style={{ borderBottom: "1px solid #222", maxWidth: 420, wordBreak: "break-word" }}>
                      {j.last_error ?? ""}
                    </td>
                    <td style={{ borderBottom: "1px solid #222", whiteSpace: "nowrap" }}>
                      <button
                        onClick={() => approve(j.job_id)}
                        disabled={!canApprove || busy}
                        style={{ padding: "6px 10px" }}
                        title={
                          !canApproveByStatus
                            ? "Solo disponible en WAITING_REVIEW o SUCCEEDED"
                            : offers > 0
                              ? `Ya existen ofertas (${offers})`
                              : "Aprobar y persistir ofertas"
                        }
                      >
                        {busy ? "Approving..." : "Approve"}
                      </button>
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
