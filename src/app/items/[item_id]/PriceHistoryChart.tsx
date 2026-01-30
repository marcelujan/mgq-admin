"use client";

import type { MouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type Row = { as_of_date: string; presentacion: number; price_ars: number };

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function daysAgoIso(maxIso: string, days: number): string | null {
  const d = new Date(maxIso);
  if (!Number.isFinite(d.getTime())) return null;
  d.setDate(d.getDate() - days);
  const yyyy = String(d.getFullYear()).padStart(4, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

type RangeKey = "30" | "60" | "100" | "180" | "365" | "all";
type Point = { x: number; y: number; d: string; v: number };

function SparkLineChart({
  title,
  series,
  fmtY,
  fmtX,
}: {
  title: string;
  series: Array<{ name: string; points: Array<{ d: string; y: number }> }>;
  fmtY: (v: number) => string;
  fmtX: (iso: string) => string;
}) {
  const [hover, setHover] = useState<{ s: number; i: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const svg = useMemo(() => {
    const W = 920;
    const H = 280;
    const PL = 64;
    const PR = 18;
    const PT = 18;
    const PB = 38;

    const all = series.flatMap((s) => s.points.map((p) => p.y));
    if (all.length === 0) {
      return {
        W,
        H,
        PL,
        PR,
        PT,
        PB,
        lines: [] as Array<{ name: string; path: string; pts: Point[] }>,
        ticksY: [] as number[],
        yScale: (_v: number) => 0,
        dates: [] as string[],
      };
    }

    let yMin = Math.min(...all);
    let yMax = Math.max(...all);
    if (yMin === yMax) {
      yMin = yMin * 0.95;
      yMax = yMax * 1.05;
      if (yMin === yMax) {
        yMin = yMin - 1;
        yMax = yMax + 1;
      }
    }

    const dates = Array.from(new Set(series.flatMap((s) => s.points.map((p) => p.d)))).sort((a, b) =>
      a.localeCompare(b)
    );

    const xScale = (iso: string) => {
      const i = dates.indexOf(iso);
      if (dates.length <= 1) return (PL + (W - PR)) / 2;
      return PL + (i * (W - PL - PR)) / (dates.length - 1);
    };

    const yScale = (v: number) => {
      const t = (v - yMin) / (yMax - yMin);
      return PT + (1 - clamp(t, 0, 1)) * (H - PT - PB);
    };

    const mkLine = (name: string, ptsRaw: Array<{ d: string; y: number }>) => {
      const pts: Point[] = ptsRaw
        .slice()
        .sort((a, b) => a.d.localeCompare(b.d))
        .map((p) => ({ x: xScale(p.d), y: yScale(p.y), d: p.d, v: p.y }));

      const path =
        pts.length <= 1 ? "" : "M " + pts.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" L ");
      return { name, path, pts };
    };

    const lines = series.map((s) => mkLine(s.name, s.points));

    const steps = 4;
    const ticksY = Array.from({ length: steps + 1 }, (_, i) => yMin + (i * (yMax - yMin)) / steps);

    return { W, H, PL, PR, PT, PB, lines, ticksY, yScale, dates };
  }, [series]);

  function onMove(e: MouseEvent<SVGSVGElement>) {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;

    const x = e.clientX - rect.left;
    const ratio = svg.W / rect.width;
    const xv = x * ratio;

    // FIX: tipado simple (evita el error de TS con best/dist)
    let best: { s: number; i: number } | null = null;
    let bestDist = Infinity;

    svg.lines.forEach((line, sIdx) => {
      line.pts.forEach((p, iIdx) => {
        const d = Math.abs(p.x - xv);
        if (d < bestDist) {
          bestDist = d;
          best = { s: sIdx, i: iIdx };
        }
      });
    });

    setHover(best);
  }

  const hoverPoint =
    hover && svg.lines[hover.s] && svg.lines[hover.s].pts[hover.i]
      ? { line: svg.lines[hover.s].name, p: svg.lines[hover.s].pts[hover.i] }
      : null;

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 14,
        padding: 12,
        background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
        color: "rgba(255,255,255,0.88)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.95 }}>{title}</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>{series.map((s) => s.name).join(" · ")}</div>
      </div>

      <div ref={wrapRef} style={{ position: "relative", marginTop: 10 }}>
        <svg
          width="100%"
          viewBox={`0 0 ${svg.W} ${svg.H}`}
          preserveAspectRatio="xMidYMid meet"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          style={{ display: "block" }}
        >
          {svg.ticksY.map((t, i) => {
            const y = svg.yScale(t);
            return (
              <g key={i}>
                <line x1={svg.PL} x2={svg.W - svg.PR} y1={y} y2={y} stroke="currentColor" strokeOpacity={0.12} />
                <text x={svg.PL - 8} y={y + 4} fontSize="12" textAnchor="end" fill="currentColor" opacity={0.75}>
                  {fmtY(t)}
                </text>
              </g>
            );
          })}

          {svg.dates && svg.dates.length >= 1 ? (
            <>
              <text x={svg.PL} y={svg.H - 10} fontSize="12" textAnchor="start" fill="currentColor" opacity={0.75}>
                {fmtX(svg.dates[0])}
              </text>
              {svg.dates.length > 1 ? (
                <text
                  x={svg.W - svg.PR}
                  y={svg.H - 10}
                  fontSize="12"
                  textAnchor="end"
                  fill="currentColor"
                  opacity={0.75}
                >
                  {fmtX(svg.dates[svg.dates.length - 1])}
                </text>
              ) : null}
            </>
          ) : null}

          {svg.lines.map((l, idx) => (
            <g key={l.name}>
              {l.path ? (
                <path
                  d={l.path}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity={series.length === 1 ? 0.95 : 0.35 + (0.55 * idx) / Math.max(1, series.length - 1)}
                  strokeWidth={series.length === 1 ? 2.6 : 2.2}
                />
              ) : null}
              {l.pts.map((p, pIdx) => {
                const isHover = hover?.s === idx && hover?.i === pIdx;
                return (
                  <circle
                    key={`${idx}_${pIdx}`}
                    cx={p.x}
                    cy={p.y}
                    r={isHover ? 5 : 3.5}
                    fill="currentColor"
                    opacity={series.length === 1 ? 0.95 : 0.40 + (0.55 * idx) / Math.max(1, series.length - 1)}
                  />
                );
              })}
            </g>
          ))}

          {hoverPoint ? (
            <line
              x1={hoverPoint.p.x}
              x2={hoverPoint.p.x}
              y1={svg.PT}
              y2={svg.H - svg.PB}
              stroke="currentColor"
              strokeOpacity={0.20}
            />
          ) : null}
        </svg>

        {hoverPoint ? (
          <div
            style={{
              position: "absolute",
              left: `calc(${(hoverPoint.p.x / svg.W) * 100}% + 10px)`,
              top: 8,
              transform: "translateX(-10px)",
              pointerEvents: "none",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 10,
              padding: "8px 10px",
              background: "rgba(10,10,10,0.85)",
              backdropFilter: "blur(6px)",
              fontSize: 12,
              lineHeight: 1.25,
              minWidth: 160,
              color: "rgba(255,255,255,0.92)",
            }}
          >
            <div style={{ opacity: 0.75 }}>{fmtX(hoverPoint.p.d)}</div>
            <div style={{ fontWeight: 700 }}>{fmtY(hoverPoint.p.v)}</div>
            {series.length > 1 ? <div style={{ opacity: 0.75 }}>{hoverPoint.line}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function PriceHistoryChart({ itemId }: { itemId: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("100");

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
    })();
  }, [itemId]);

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

  const presList = useMemo(() => {
    return Array.from(new Set(rows.map((x) => Number(x.presentacion))))
      .filter((x) => Number.isFinite(x) && x > 0)
      .sort((a, b) => a - b);
  }, [rows]);

  const maxDate = useMemo(() => {
    const d = rows.map((r) => r.as_of_date).filter(Boolean).sort((a, b) => a.localeCompare(b));
    return d.length ? d[d.length - 1] : null;
  }, [rows]);

  const cutoffIso = useMemo(() => {
    if (!maxDate) return null;
    if (range === "all") return null;
    const days = Number(range);
    if (!Number.isFinite(days)) return null;
    return daysAgoIso(maxDate, Math.max(0, days - 1));
  }, [maxDate, range]);

  const filteredRows = useMemo(() => {
    if (!cutoffIso) return rows;
    return rows.filter((r) => r.as_of_date >= cutoffIso);
  }, [rows, cutoffIso]);

  const unitSeries = useMemo(() => {
    const byPres = new Map<number, Array<{ d: string; y: number }>>();
    for (const r of filteredRows) {
      const pres = Number(r.presentacion);
      const price = Number(r.price_ars);
      if (!Number.isFinite(pres) || pres <= 0) continue;
      if (!Number.isFinite(price)) continue;
      const y = price / pres;
      if (!Number.isFinite(y)) continue;
      if (!byPres.has(pres)) byPres.set(pres, []);
      byPres.get(pres)!.push({ d: r.as_of_date, y });
    }
    return Array.from(byPres.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([pres, points]) => ({ name: `${pres} u`, points }));
  }, [filteredRows]);

  const chartsByPres = useMemo(() => {
    return presList.map((pres) => {
      const points = filteredRows
        .filter((r) => Number(r.presentacion) === pres)
        .map((r) => ({ d: r.as_of_date, y: Number(r.price_ars) }))
        .filter((p) => Number.isFinite(p.y));
      return { pres, points };
    });
  }, [filteredRows, presList]);

  if (err) return <div style={{ color: "#ff6b6b", fontSize: 14 }}>Error: {err}</div>;
  if (rows.length === 0) return <div style={{ fontSize: 14, opacity: 0.85 }}>Sin datos todavía.</div>;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.9 }}>Intervalo</div>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as RangeKey)}
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 8,
            padding: "6px 10px",
            background: "rgba(255,255,255,0.03)",
            color: "rgba(255,255,255,0.92)",
            outline: "none",
          }}
        >
          <option value="30">Últimos 30 días</option>
          <option value="60">Últimos 60 días</option>
          <option value="100">Últimos 100 días</option>
          <option value="180">Últimos 180 días</option>
          <option value="365">Último año</option>
          <option value="all">Todo</option>
        </select>

        {cutoffIso && maxDate ? (
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {fmtDate(cutoffIso)} → {fmtDate(maxDate)}
          </div>
        ) : null}
      </div>

      <SparkLineChart
        title="Precio por unidad (todas las presentaciones)"
        series={unitSeries}
        fmtY={(v) => fmtArs.format(Math.round(v))}
        fmtX={fmtDate}
      />

      <div style={{ display: "grid", gap: 12 }}>
        {chartsByPres.map((c) => (
          <SparkLineChart
            key={c.pres}
            title={`Precio total · Presentación ${c.pres}`}
            series={[{ name: `${c.pres}`, points: c.points }]}
            fmtY={(v) => fmtArs.format(Math.round(v))}
            fmtX={fmtDate}
          />
        ))}
      </div>
    </div>
  );
}
