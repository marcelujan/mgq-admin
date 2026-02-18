"use client";

import type { MouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type Row = { as_of_date: string; presentacion: number; price_ars: number };
type SeriesPoint = { date: string; value: number };
type Series = { id: string; label: string; unit: string; points: SeriesPoint[] };

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

  const palette = useMemo(
    () => ["#60a5fa", "#34d399", "#f59e0b", "#f472b6", "#a78bfa", "#22d3ee", "#fb7185", "#eab308"],
    []
  );

  const svg = useMemo(() => {
    const W = 920;
    const H = 280;
    const PL = 64;
    const PR = 18;
    const PT = 18;
    const PB = 38;

    const all = series.flatMap((s) => s.points.map((p) => p.y)).filter((x) => Number.isFinite(x));
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

    const dates = Array.from(new Set(series.flatMap((s) => s.points.map((p) => p.d))))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

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
        .filter((p) => p?.d && Number.isFinite(p.y))
        .sort((a, b) => a.d.localeCompare(b.d))
        .map((p) => ({ x: xScale(p.d), y: yScale(p.y), d: p.d, v: p.y }));

      // Dejar que con 1 punto igual se vea el dot (path vacío ok).
      const path = pts.length <= 1 ? "" : "M " + pts.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" L ");
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
      ? { line: svg.lines[hover.s].name, p: svg.lines[hover.s].pts[hover.i], s: hover.s }
      : null;

  const isMulti = series.length > 1;

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

        {isMulti ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {series.map((s, idx) => (
              <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, opacity: 0.85 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: palette[idx % palette.length],
                    display: "inline-block",
                  }}
                />
                <span>{s.name}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.7 }}>{series.map((s) => s.name).join(" · ")}</div>
        )}
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

          {svg.dates.length >= 1 ? (
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

          {svg.lines.map((l, idx) => {
            const stroke = isMulti ? palette[idx % palette.length] : "currentColor";
            return (
              <g key={l.name}>
                {l.path ? <path d={l.path} fill="none" stroke={stroke} strokeOpacity={0.95} strokeWidth={2.4} /> : null}
                {l.pts.map((p, pIdx) => {
                  const isHover = hover?.s === idx && hover?.i === pIdx;
                  return <circle key={`${idx}_${pIdx}`} cx={p.x} cy={p.y} r={isHover ? 5 : 3.5} fill={stroke} opacity={0.95} />;
                })}
              </g>
            );
          })}

          {hoverPoint ? (
            <line
              x1={hoverPoint.p.x}
              x2={hoverPoint.p.x}
              y1={svg.PT}
              y2={svg.H - svg.PB}
              stroke="currentColor"
              strokeOpacity={0.2}
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
              minWidth: 170,
              color: "rgba(255,255,255,0.92)",
            }}
          >
            <div style={{ opacity: 0.75 }}>{fmtX(hoverPoint.p.d)}</div>
            <div style={{ fontWeight: 700 }}>{fmtY(hoverPoint.p.v)}</div>
            {isMulti ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, opacity: 0.85, marginTop: 2 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: palette[hoverPoint.s % palette.length],
                    display: "inline-block",
                  }}
                />
                <span>{hoverPoint.line}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function parsePresFromSeries(s: Series): number | null {
  // Prefer id "pres:0.5"
  const m1 = String(s.id || "").match(/^pres:(.+)$/);
  if (m1) {
    const n = Number(m1[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  // Fallback label "0.5"
  const n = Number(s.label);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function PriceHistoryChart({ itemKey }: { itemKey: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [series, setSeries] = useState<Series[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Default pedido: 30 días
  const [range, setRange] = useState<RangeKey>("30");

  useEffect(() => {
    let alive = true;
    (async () => {
      setErr(null);
      setSeries(null);
      setRows([]);

      // Evitar double-encoding: itemKey puede venir como "p:231" o "p%3A231".
      const res = await fetch(`/api/items/${itemKey}/price-history`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));

      if (!alive) return;

      if (!res.ok || !j?.ok) {
        setErr(j?.error ?? `http_${res.status}`);
        return;
      }

      if (Array.isArray(j?.series)) {
        const s = (j.series as any[])
          .map((x) => {
            const id = String(x?.id ?? "");
            const label = String(x?.label ?? id);
            const unit = String(x?.unit ?? "ARS");

            const pts = Array.isArray(x?.points)
              ? (x.points as any[])
                  .map((p) => {
                    // Contrato real: {d,y}. Pero aceptar {date,value} por compat.
                    const d = String(p?.d ?? p?.date ?? "");
                    const y = Number(p?.y ?? p?.value);
                    if (!d || !Number.isFinite(y)) return null;
                    return { date: d, value: y };
                  })
                  .filter(Boolean) as SeriesPoint[]
              : [];

            pts.sort((a, b) => a.date.localeCompare(b.date));
            return { id, label, unit, points: pts };
          })
          .filter((x) => x.id && x.points.length);

        setSeries(s.length ? (s as Series[]) : []);
        return;
      }

      const r = Array.isArray(j?.rows) ? (j.rows as any[]) : [];
      const parsed = r
        .map((x) => ({
          as_of_date: String(x?.as_of_date ?? x?.date ?? ""),
          presentacion: Number(x?.presentacion),
          price_ars: Number(x?.price_ars ?? x?.price),
        }))
        .filter((x) => x.as_of_date && Number.isFinite(x.presentacion) && Number.isFinite(x.price_ars));

      setRows(parsed);
    })().catch((e) => {
      if (!alive) return;
      setErr(String(e?.message ?? e));
    });

    return () => {
      alive = false;
    };
  }, [itemKey]);

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

  const maxDate = useMemo(() => {
    if (series && series.length) {
      const d = series.flatMap((s) => s.points.map((p) => p.date)).filter(Boolean).sort((a, b) => a.localeCompare(b));
      return d.length ? d[d.length - 1] : null;
    }
    const d = rows.map((r) => r.as_of_date).filter(Boolean).sort((a, b) => a.localeCompare(b));
    return d.length ? d[d.length - 1] : null;
  }, [rows, series]);

  const cutoffIso = useMemo(() => {
    if (!maxDate) return null;
    if (range === "all") return null;
    const days = Number(range);
    if (!Number.isFinite(days)) return null;
    return daysAgoIso(maxDate, Math.max(0, days - 1));
  }, [maxDate, range]);

  if (err) return <div style={{ color: "#ff6b6b", fontSize: 14 }}>Error: {err}</div>;

  // Mantener contrato actual: si no hay datos => Sin histórico.
  const noData = (!series || series.length === 0) && rows.length === 0;
  if (noData) return <div style={{ fontSize: 14, opacity: 0.85 }}>Sin histórico.</div>;

  // Si llega series[] (PROVEEDOR actual y también FORMULADO/MANUAL futuro)
  if (series && series.length) {
    const cutoff = cutoffIso;

    // Caso PROVEEDOR con series "pres:*": armar gráficos individuales + unitario
    const presParsed = series
      .map((s) => ({ s, pres: parsePresFromSeries(s) }))
      .filter((x) => x.pres != null) as { s: Series; pres: number }[];

    const looksLikeProveedor = presParsed.length >= 1 && presParsed.length === series.length;

    if (looksLikeProveedor) {
      const presList = presParsed.map((x) => x.pres).sort((a, b) => a - b);

      // Precio por unidad para todas las presentaciones (multiserie)
      const unitSeries = presParsed.map(({ s, pres }) => {
        const pts = (cutoff ? s.points.filter((p) => p.date >= cutoff) : s.points)
          .map((p) => ({ d: p.date, y: p.value / pres }))
          .filter((p) => Number.isFinite(p.y));
        return { name: `${pres} u`, points: pts };
      });

      // Gráficos por presentación: precio total
      const chartsByPres = presParsed
        .slice()
        .sort((a, b) => a.pres - b.pres)
        .map(({ s, pres }) => {
          const pts = (cutoff ? s.points.filter((p) => p.date >= cutoff) : s.points)
            .map((p) => ({ d: p.date, y: p.value }))
            .filter((p) => Number.isFinite(p.y));
          return { pres, points: pts };
        });

      return (
        <div style={{ display: "grid", gap: 14 }}>
          <style jsx global>{`
            .ph_range {
              color-scheme: dark;
            }
            .ph_range option {
              background: #0b0b0b;
              color: #ffffff;
            }
          `}</style>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.9 }}>Intervalo</div>
            <select
              className="ph_range"
              value={range}
              onChange={(e) => setRange(e.target.value as RangeKey)}
              style={{
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: 8,
                padding: "6px 10px",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.88)",
                fontSize: 13,
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
                title={`Precio total · Presentación ${c.pres} u`}
                series={[{ name: `${c.pres} u`, points: c.points }]}
                fmtY={(v) => fmtArs.format(Math.round(v))}
                fmtX={fmtDate}
              />
            ))}
          </div>
        </div>
      );
    }

    // Caso FORMULADO/MANUAL: agrupar por unidad y hacer 1 chart por unidad (multiserie)
    const byUnit = new Map<string, Series[]>();
    for (const s of series) {
      const unit = s.unit || "ARS";
      if (!byUnit.has(unit)) byUnit.set(unit, []);
      byUnit.get(unit)!.push(s);
    }

    const charts = Array.from(byUnit.entries()).map(([unit, list]) => {
      const ser = list.map((s) => ({
        name: s.label || s.id,
        points: (cutoff ? s.points.filter((p) => p.date >= cutoff) : s.points).map((p) => ({ d: p.date, y: p.value })),
      }));

      const fmtY = (v: number) => {
        if (unit === "ARS") return fmtArs.format(v);
        if (unit === "ARS/kg") return `${fmtArs.format(v)}/kg`;
        if (unit === "ARS/L") return `${fmtArs.format(v)}/L`;
        if (unit === "ARS/u") return `${fmtArs.format(v)}/u`;
        return fmtArs.format(v);
      };

      const title = unit === "ARS" ? "Histórico (ARS)" : `Histórico (${unit})`;
      return <SparkLineChart key={unit} title={title} series={ser} fmtY={fmtY} fmtX={fmtDate} />;
    });

    return (
      <div style={{ display: "grid", gap: 14 }}>
        <style jsx global>{`
          .ph_range {
            color-scheme: dark;
          }
          .ph_range option {
            background: #0b0b0b;
            color: #ffffff;
          }
        `}</style>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.9 }}>Intervalo</div>
          <select
            className="ph_range"
            value={range}
            onChange={(e) => setRange(e.target.value as RangeKey)}
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 8,
              padding: "6px 10px",
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.88)",
              fontSize: 13,
              outline: "none",
            }}
          >
            <option value="30">30 días</option>
            <option value="60">60 días</option>
            <option value="100">100 días</option>
            <option value="180">180 días</option>
            <option value="365">365 días</option>
            <option value="all">Todo</option>
          </select>
        </div>

        {charts}
      </div>
    );
  }

  // Fallback PROVEEDOR legacy (rows)
  const presList = Array.from(new Set(rows.map((x) => Number(x.presentacion))))
    .filter((x) => Number.isFinite(x) && x > 0)
    .sort((a, b) => a - b);

  const filteredRows = cutoffIso ? rows.filter((r) => r.as_of_date >= cutoffIso) : rows;

  const unitSeries = (() => {
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
  })();

  const chartsByPres = presList.map((pres) => {
    const points = filteredRows
      .filter((r) => Number(r.presentacion) === pres)
      .map((r) => ({ d: r.as_of_date, y: Number(r.price_ars) }))
      .filter((p) => Number.isFinite(p.y));
    return { pres, points };
  });

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <style jsx global>{`
        .ph_range {
          color-scheme: dark;
        }
        .ph_range option {
          background: #0b0b0b;
          color: #ffffff;
        }
      `}</style>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.9 }}>Intervalo</div>
        <select
          className="ph_range"
          value={range}
          onChange={(e) => setRange(e.target.value as RangeKey)}
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 8,
            padding: "6px 10px",
            background: "rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.88)",
            fontSize: 13,
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
            title={`Precio total · Presentación ${c.pres} u`}
            series={[{ name: `${c.pres} u`, points: c.points }]}
            fmtY={(v) => fmtArs.format(Math.round(v))}
            fmtX={fmtDate}
          />
        ))}
      </div>
    </div>
  );
}