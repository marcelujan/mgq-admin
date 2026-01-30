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
  ofertas_count?: number; // nuevo
};

export default function JobsPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
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
