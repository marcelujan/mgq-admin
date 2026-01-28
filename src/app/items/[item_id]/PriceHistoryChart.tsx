"use client";

import { useEffect, useMemo, useState } from "react";

type Row = { as_of_date: string; presentacion: number; price_ars: number };

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export default function PriceHistoryChart({ itemId }: { itemId: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [presentacion, setPresentacion] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      setErr(null);
      const res = await fetch(`/api/items/${itemId}/price-history`, { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j?.error ?? `http_${res.status}`);
        return;
      }
      const j = await res.json();
      const r = Array.isArray(j?.rows) ? (j.rows as Row[]) : [];
      setRows(r);

      const pres = Array.from(new Set(r.map((x) => Number(x.presentacion))))
        .filter((x) => Number.isFinite(x))
        .sort((a, b) => a - b);

      setPresentacion(pres.length ? pres[0] : null);
    })();
  }, [itemId]);

  const presList = useMemo(() => {
    return Array.from(new Set(rows.map((x) => Number(x.presentacion))))
      .filter((x) => Number.isFinite(x))
      .sort((a, b) => a - b);
  }, [rows]);

  const series = useMemo(() => {
    if (presentacion === null) return [];
    return rows
      .filter((r) => Number(r.presentacion) === presentacion)
      .map((r) => ({ d: r.as_of_date, y: Number(r.price_ars) }))
      .filter((p) => Number.isFinite(p.y))
      .sort((a, b) => a.d.localeCompare(b.d));
  }, [rows, presentacion]);

  const svg = useMemo(() => {
    const W = 760;
    const H = 260;
    const P = 28;

    if (series.length === 0) return { W, H, path: "", points: [] as any[], yMin: 0, yMax: 0 };

    const ys = series.map((s) => s.y);
    let yMin = Math.min(...ys);
    let yMax = Math.max(...ys);

    if (yMin === yMax) {
      yMin = yMin * 0.95;
      yMax = yMax * 1.05;
      if (yMin === yMax) {
        yMin = yMin - 1;
        yMax = yMax + 1;
      }
    }

    const xScale = (i: number) =>
      series.length === 1 ? W / 2 : P + (i * (W - 2 * P)) / (series.length - 1);

    const yScale = (v: number) => {
      const t = (v - yMin) / (yMax - yMin);
      return P + (1 - clamp(t, 0, 1)) * (H - 2 * P);
    };

    const points = series.map((s, i) => ({
      x: xScale(i),
      y: yScale(s.y),
      d: s.d,
      v: s.y,
    }));

    const path =
      points.length <= 1
        ? ""
        : "M " + points.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" L ");

    return { W, H, path, points, yMin, yMax };
  }, [series]);

  if (err) return <div style={{ color: "#f55", fontSize: 14 }}>Error: {err}</div>;
  if (rows.length === 0) return <div style={{ fontSize: 14 }}>Sin datos todavía.</div>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Presentación</div>
        <select
          style={{ border: "1px solid #333", borderRadius: 6, padding: "4px 8px", background: "transparent", color: "inherit" }}
          value={presentacion ?? ""}
          onChange={(e) => setPresentacion(e.target.value ? Number(e.target.value) : null)}
        >
          {presList.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {series.length < 2 ? (
        <div style={{ fontSize: 14, opacity: 0.8 }}>
          Hay {series.length} punto(s) para esta presentación. Con 2+ días vas a ver una línea.
        </div>
      ) : null}

      <div style={{ border: "1px solid #222", borderRadius: 10, padding: 12 }}>
        <svg width="100%" viewBox={`0 0 ${svg.W} ${svg.H}`} preserveAspectRatio="none">
          <rect x="0" y="0" width={svg.W} height={svg.H} fill="transparent" />

          <text x="6" y="18" fontSize="12">
            {Math.round(svg.yMax).toLocaleString("es-AR")}
          </text>
          <text x="6" y={svg.H - 8} fontSize="12">
            {Math.round(svg.yMin).toLocaleString("es-AR")}
          </text>

          {svg.path ? <path d={svg.path} fill="none" stroke="currentColor" strokeWidth="2" /> : null}

          {svg.points.map((p, idx) => (
            <g key={idx}>
              <circle cx={p.x} cy={p.y} r="3.5" />
              <text x={p.x + 6} y={p.y - 6} fontSize="12">
                {Math.round(p.v).toLocaleString("es-AR")}
              </text>
            </g>
          ))}

          {svg.points.length >= 1 ? (
            <>
              <text x={svg.points[0].x} y={svg.H - 6} fontSize="12" textAnchor="middle">
                {svg.points[0].d}
              </text>
              {svg.points.length > 1 ? (
                <text x={svg.points[svg.points.length - 1].x} y={svg.H - 6} fontSize="12" textAnchor="middle">
                  {svg.points[svg.points.length - 1].d}
                </text>
              ) : null}
            </>
          ) : null}
        </svg>
      </div>
    </div>
  );
}
