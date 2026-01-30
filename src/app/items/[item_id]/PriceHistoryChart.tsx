"use client";

import type { MouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type Row = { as_of_date: string; presentacion: number; price_ars: number };

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export default function PriceHistoryChart({ itemId }: { itemId: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [presentacion, setPresentacion] = useState<number | null>(null);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

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

  const fmtArs = useMemo(() => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    });
  }, []);

  const fmtDate = useMemo(() => {
    const f = new Intl.DateTimeFormat("es-AR", { year: "2-digit", month: "2-digit", day: "2-digit" });
    return (iso: string) => {
      const d = new Date(iso);
      return Number.isFinite(d.getTime()) ? f.format(d) : iso;
    };
  }, []);

  const svg = useMemo(() => {
    const W = 860;
    const H = 320;

    // paddings (para labels y ejes)
    const PL = 56; // left
    const PR = 18; // right
    const PT = 18; // top
    const PB = 36; // bottom

    if (series.length === 0) {
      return {
        W,
        H,
        PL,
        PR,
        PT,
        PB,
        path: "",
        points: [] as Array<{ x: number; y: number; d: string; v: number }>,
        yMin: 0,
        yMax: 0,
        ticksY: [] as number[],
      };
    }

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
      series.length === 1 ? (PL + (W - PR)) / 2 : PL + (i * (W - PL - PR)) / (series.length - 1);

    const yScale = (v: number) => {
      const t = (v - yMin) / (yMax - yMin);
      return PT + (1 - clamp(t, 0, 1)) * (H - PT - PB);
    };

    const points = series.map((s, i) => ({
      x: xScale(i),
      y: yScale(s.y),
      d: s.d,
      v: s.y,
    }));

    const path =
      points.length <= 1 ? "" : "M " + points.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" L ");

    const steps = 4; // 5 ticks (incluye min y max)
    const ticksY = Array.from({ length: steps + 1 }, (_, i) => yMin + (i * (yMax - yMin)) / steps);

    return { W, H, PL, PR, PT, PB, path, points, yMin, yMax, ticksY, yScale };
  }, [series]);

  function onMove(e: MouseEvent<SVGSVGElement>) {
    if (!wrapRef.current || svg.points.length === 0) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = svg.W / rect.width; // px -> coords del viewBox
    const xv = x * ratio;

    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < svg.points.length; i++) {
      const d = Math.abs(svg.points[i].x - xv);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    setHoverIdx(best);
  }

  if (err) return <div style={{ color: "#f55", fontSize: 14 }}>Error: {err}</div>;
  if (rows.length === 0) return <div style={{ fontSize: 14 }}>Sin datos todavía.</div>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.9 }}>Presentación</div>
        <select
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 8,
            padding: "6px 10px",
            background: "rgba(255,255,255,0.03)",
            color: "inherit",
            outline: "none",
          }}
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
        <div style={{ fontSize: 13, opacity: 0.75 }}>
          Hay {series.length} punto(s) para esta presentación. Con 2+ días vas a ver una línea.
        </div>
      ) : null}

      <div
        ref={wrapRef}
        style={{
          position: "relative",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 14,
          padding: 12,
          background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
        }}
      >
        <svg
          width="100%"
          viewBox={`0 0 ${svg.W} ${svg.H}`}
          preserveAspectRatio="xMidYMid meet"
          onMouseMove={onMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="ph_line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.65" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="1" />
            </linearGradient>
          </defs>

          {/* grid + y ticks */}
          {svg.ticksY.map((t, i) => {
            const y = svg.yScale(t);
            return (
              <g key={i}>
                <line x1={svg.PL} x2={svg.W - svg.PR} y1={y} y2={y} stroke="currentColor" strokeOpacity={0.10} />
                <text x={svg.PL - 6} y={y + 4} fontSize="12" textAnchor="end" opacity={0.75}>
                  {fmtArs.format(Math.round(t))}
                </text>
              </g>
            );
          })}

          {/* line */}
          {svg.path ? <path d={svg.path} fill="none" stroke="url(#ph_line)" strokeWidth="2.5" /> : null}

          {/* points */}
          {svg.points.map((p, idx) => {
            const isHover = hoverIdx === idx;
            return (
              <g key={idx}>
                <circle cx={p.x} cy={p.y} r={isHover ? 5 : 3.5} fill="currentColor" opacity={isHover ? 1 : 0.9} />
              </g>
            );
          })}

          {/* hover crosshair */}
          {hoverIdx !== null && svg.points[hoverIdx] ? (
            <g>
              <line
                x1={svg.points[hoverIdx].x}
                x2={svg.points[hoverIdx].x}
                y1={svg.PT}
                y2={svg.H - svg.PB}
                stroke="currentColor"
                strokeOpacity={0.18}
              />
            </g>
          ) : null}

          {/* x labels (first/last) */}
          {svg.points.length >= 1 ? (
            <>
              <text x={svg.points[0].x} y={svg.H - 10} fontSize="12" textAnchor="middle" opacity={0.75}>
                {fmtDate(svg.points[0].d)}
              </text>
              {svg.points.length > 1 ? (
                <text
                  x={svg.points[svg.points.length - 1].x}
                  y={svg.H - 10}
                  fontSize="12"
                  textAnchor="middle"
                  opacity={0.75}
                >
                  {fmtDate(svg.points[svg.points.length - 1].d)}
                </text>
              ) : null}
            </>
          ) : null}
        </svg>

        {/* tooltip */}
        {hoverIdx !== null && svg.points[hoverIdx] ? (
          <div
            style={{
              position: "absolute",
              left: `calc(${(svg.points[hoverIdx].x / svg.W) * 100}% + 10px)`,
              top: 10,
              transform: "translateX(-10px)",
              pointerEvents: "none",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 10,
              padding: "8px 10px",
              background: "rgba(10,10,10,0.85)",
              backdropFilter: "blur(6px)",
              fontSize: 12,
              lineHeight: 1.25,
              minWidth: 140,
            }}
          >
            <div style={{ opacity: 0.75 }}>{fmtDate(svg.points[hoverIdx].d)}</div>
            <div style={{ fontWeight: 700 }}>{fmtArs.format(Math.round(svg.points[hoverIdx].v))}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
