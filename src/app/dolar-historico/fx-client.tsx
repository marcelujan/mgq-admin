"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

type FxRow = {
  fecha: string;
  valor: number | null;
};

type SortKey = "fecha" | "valor";
type SortDir = "asc" | "desc";

type ChartPoint = {
  fecha: string;
  valor: number;
};

function compareText(a: string, b: string, dir: SortDir): number {
  const cmp = a.localeCompare(b, "es", { sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

function compareNumber(a: number, b: number, dir: SortDir): number {
  const cmp = a - b;
  return dir === "asc" ? cmp : -cmp;
}

function fmtValor(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "-";
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(Number(n));
}

function fmtFecha(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return iso;
  return `${m[3]}/${m[2]}`;
}

function dateMinusDays(iso: string, days: number): string | null {
  const d = new Date(`${iso}T00:00:00`);
  if (!Number.isFinite(d.getTime())) return null;
  d.setDate(d.getDate() - days);
  const yyyy = String(d.getFullYear()).padStart(4, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function FxHistoryChart({ points }: { points: ChartPoint[] }) {
  const chart = useMemo(() => {
    const W = 920;
    const H = 260;
    const PL = 60;
    const PR = 18;
    const PT = 18;
    const PB = 34;

    if (!points.length) {
      return { W, H, PL, PR, PT, PB, path: "", pts: [] as Array<{ x: number; y: number; fecha: string; valor: number }>, ticksY: [] as number[] };
    }

    const values = points.map((p) => p.valor).filter((v) => Number.isFinite(v));
    let yMin = Math.min(...values);
    let yMax = Math.max(...values);
    if (yMin === yMax) {
      yMin -= 1;
      yMax += 1;
    }
    const pad = Math.max((yMax - yMin) * 0.08, 1);
    yMin -= pad;
    yMax += pad;

    const xScale = (index: number) => {
      if (points.length <= 1) return (PL + (W - PR)) / 2;
      return PL + (index * (W - PL - PR)) / (points.length - 1);
    };
    const yScale = (v: number) => PT + (1 - (v - yMin) / (yMax - yMin)) * (H - PT - PB);

    const pts = points.map((p, idx) => ({ x: xScale(idx), y: yScale(p.valor), fecha: p.fecha, valor: p.valor }));
    const path = pts.length <= 1 ? "" : `M ${pts.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" L ")}`;
    const steps = 4;
    const ticksY = Array.from({ length: steps + 1 }, (_, i) => yMin + (i * (yMax - yMin)) / steps);

    return { W, H, PL, PR, PT, PB, path, pts, ticksY };
  }, [points]);

  const last = points.length ? points[points.length - 1] : null;

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 14,
        padding: 12,
        background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.95 }}>USD venta · 30 días</div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>{last ? `${last.fecha} · ${fmtValor(last.valor)}` : "Sin datos"}</div>
      </div>

      {points.length === 0 ? (
        <div style={{ fontSize: 12, opacity: 0.72, padding: "8px 0" }}>No hay datos suficientes para el gráfico.</div>
      ) : (
        <div style={{ width: "100%", overflowX: "auto" }}>
          <svg viewBox={`0 0 ${chart.W} ${chart.H}`} style={{ width: "100%", height: "auto", display: "block" }}>
            {chart.ticksY.map((tick) => {
              const y = chart.PT + (1 - (tick - chart.ticksY[0]) / (chart.ticksY[chart.ticksY.length - 1] - chart.ticksY[0])) * (chart.H - chart.PT - chart.PB);
              return (
                <g key={tick}>
                  <line x1={chart.PL} x2={chart.W - chart.PR} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                  <text x={chart.PL - 8} y={y + 4} textAnchor="end" fontSize="11" fill="rgba(255,255,255,0.6)">
                    {fmtValor(tick)}
                  </text>
                </g>
              );
            })}

            {chart.pts.map((p, idx) => (
              <text
                key={`x-${p.fecha}`}
                x={p.x}
                y={chart.H - 10}
                textAnchor={idx === 0 ? "start" : idx === chart.pts.length - 1 ? "end" : "middle"}
                fontSize="11"
                fill="rgba(255,255,255,0.58)"
              >
                {fmtFecha(p.fecha)}
              </text>
            ))}

            {chart.path ? (
              <path d={chart.path} fill="none" stroke="#60a5fa" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
            ) : null}

            {chart.pts.map((p) => (
              <g key={p.fecha}>
                <circle cx={p.x} cy={p.y} r="3.2" fill="#60a5fa" />
                <title>{`${p.fecha} · ${fmtValor(p.valor)}`}</title>
              </g>
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}

export default function FxClient() {
  const [rows, setRows] = useState<FxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("fecha");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "400");
      if (search.trim()) qs.set("search", search.trim());
      const res = await fetch(`/api/fx?${qs.toString()}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [search]);

  function toggleSort(key: SortKey) {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir(key === "fecha" ? "desc" : "asc");
      return key;
    });
  }

  function sortLabel(key: SortKey): string {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (sortKey === "fecha") return compareText(a.fecha || "", b.fecha || "", sortDir);
      return compareNumber(Number(a.valor ?? Number.NEGATIVE_INFINITY), Number(b.valor ?? Number.NEGATIVE_INFINITY), sortDir);
    });
  }, [rows, sortKey, sortDir]);

  const chartPoints = useMemo(() => {
    const valid = [...rows]
      .filter((r) => r.fecha && Number.isFinite(Number(r.valor)))
      .map((r) => ({ fecha: String(r.fecha), valor: Number(r.valor) }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (!valid.length) return [] as ChartPoint[];
    const maxDate = valid[valid.length - 1].fecha;
    const minDate = dateMinusDays(maxDate, 29);
    return minDate ? valid.filter((r) => r.fecha >= minDate) : valid.slice(-30);
  }, [rows]);

  const thBase: CSSProperties = { padding: "6px 10px", opacity: 0.8, lineHeight: 1.15 };
  const thButton: CSSProperties = {
    all: "unset",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    color: "inherit",
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <FxHistoryChart points={chartPoints} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por fecha..."
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.03)",
              width: 220,
            }}
          />
          {loading ? <span style={{ fontSize: 12, opacity: 0.75 }}>Cargando...</span> : null}
          {error ? <span style={{ fontSize: 12, color: "tomato" }}>{error}</span> : null}
        </div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>{rows.length} registro(s)</div>
      </div>

      <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", background: "rgba(255,255,255,0.04)" }}>
              <th style={{ ...thBase, width: 130 }}>
                <button type="button" onClick={() => toggleSort("fecha")} style={thButton}>Fecha{sortLabel("fecha")}</button>
              </th>
              <th style={{ ...thBase, width: 160, textAlign: "right" }}>
                <button type="button" onClick={() => toggleSort("valor")} style={{ ...thButton, marginLeft: "auto" }}>USD venta{sortLabel("valor")}</button>
              </th>
              <th style={{ ...thBase, width: 120 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.fecha} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <td style={{ padding: "6px 10px", lineHeight: 1.15, whiteSpace: "nowrap" }}>{r.fecha}</td>
                <td style={{ padding: "6px 10px", lineHeight: 1.15, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtValor(r.valor)}</td>
                <td style={{ padding: "6px 10px", lineHeight: 1.15, whiteSpace: "nowrap" }}>
                  <div style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                    <Link href={`/dolar-historico/${encodeURIComponent(r.fecha)}`} style={{ textDecoration: "none", opacity: 0.9 }}>Editar</Link>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && sorted.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: "8px 10px", opacity: 0.75, lineHeight: 1.15 }}>
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
