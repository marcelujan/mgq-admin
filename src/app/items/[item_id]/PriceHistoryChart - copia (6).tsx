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
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function fmtArs(n: number) {
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

function safeNum(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function pickMaxDate(points: SeriesPoint[]): string | null {
  let max: string | null = null;
  for (const p of points) {
    if (!p?.date) continue;
    if (!max || p.date > max) max = p.date;
  }
  return max;
}

function ensureSeriesFromRows(rows: Row[]): Series[] {
  const byPres = new Map<number, SeriesPoint[]>();
  for (const r of rows) {
    const pres = Number(r.presentacion);
    const price = Number(r.price_ars);
    if (!Number.isFinite(pres) || !Number.isFinite(price)) continue;
    if (!byPres.has(pres)) byPres.set(pres, []);
    byPres.get(pres)!.push({ date: r.as_of_date, value: price });
  }
  const out: Series[] = [];
  for (const [pres, pts] of byPres.entries()) {
    pts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    out.push({ id: `pres:${pres}`, label: String(pres), unit: "ARS", points: pts });
  }
  out.sort((a, b) => a.label.localeCompare(b.label, "es"));
  return out;
}

function calcBounds(series: Series[]) {
  let minX: string | null = null;
  let maxX: string | null = null;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const s of series) {
    for (const p of s.points) {
      if (!minX || p.date < minX) minX = p.date;
      if (!maxX || p.date > maxX) maxX = p.date;
      if (p.value < minY) minY = p.value;
      if (p.value > maxY) maxY = p.value;
    }
  }

  if (!minX || !maxX || !Number.isFinite(minY) || !Number.isFinite(maxY)) return null;

  if (minY === maxY) {
    const pad = Math.max(1, Math.abs(minY) * 0.05);
    minY -= pad;
    maxY += pad;
  }

  return { minX, maxX, minY, maxY };
}

function dateToX(date: string, minX: string, maxX: string, width: number) {
  const a = new Date(minX).getTime();
  const b = new Date(maxX).getTime();
  const t = new Date(date).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(t) || a === b) return 0;
  return ((t - a) / (b - a)) * width;
}

function valToY(v: number, minY: number, maxY: number, height: number) {
  if (maxY === minY) return height / 2;
  const t = (v - minY) / (maxY - minY);
  return height - t * height;
}

function buildPath(
  points: SeriesPoint[],
  minX: string,
  maxX: string,
  minY: number,
  maxY: number,
  width: number,
  height: number
) {
  if (!points.length) return "";
  const cmds: string[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const x = dateToX(p.date, minX, maxX, width);
    const y = valToY(p.value, minY, maxY, height);
    cmds.push(`${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return cmds.join(" ");
}

function nearestByDate(series: Series[], targetDate: string) {
  let bestDate: string | null = null;
  let bestDt = Number.POSITIVE_INFINITY;

  const t = new Date(targetDate).getTime();
  if (!Number.isFinite(t)) return null;

  for (const s of series) {
    for (const p of s.points) {
      const pt = new Date(p.date).getTime();
      if (!Number.isFinite(pt)) continue;
      const dt = Math.abs(pt - t);
      if (dt < bestDt) {
        bestDt = dt;
        bestDate = p.date;
      }
    }
  }

  if (!bestDate) return null;

  const items = series
    .map((s) => {
      const p = s.points.find((x) => x.date === bestDate) ?? null;
      return p ? { s, p } : null;
    })
    .filter(Boolean) as { s: Series; p: SeriesPoint }[];

  items.sort((a, b) => b.p.value - a.p.value);

  return { date: bestDate, items };
}

/** Paleta fija y estable */
const PALETTE = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#7c3aed",
  "#ea580c",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#ca8a04",
  "#0f766e",
];

function hashStringToInt(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function colorForSeriesId(id: string): string {
  return PALETTE[hashStringToInt(id) % PALETTE.length];
}

type Props = {
  itemKey: string;
};

export default function PriceHistoryChart({ itemKey }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [series, setSeries] = useState<Series[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState<number>(90);

  // Hover
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverIso, setHoverIso] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      setErr(null);
      setSeries(null);
      setRows([]);

      const res = await fetch(`/api/items/${itemKey}/price-history`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));

      if (!res.ok || !j?.ok) {
        if (!alive) return;
        setErr(j?.error ?? `http_${res.status}`);
        return;
      }

      // series[] (contrato actual)
      if (Array.isArray(j?.series)) {
        const s = (j.series as any[])
          .map((x) => {
            const id = String(x?.id ?? "");
            const label = String(x?.label ?? id);
            const unit = String(x?.unit ?? "ARS");
            const pts = Array.isArray(x?.points)
              ? (x.points as any[])
                  .map((p) => {
                    const date = String(p?.d ?? p?.date ?? "");
                    const value = safeNum(p?.y ?? p?.value);
                    if (!date || value == null) return null;
                    return { date, value };
                  })
                  .filter(Boolean) as SeriesPoint[]
              : [];
            pts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
            return { id, label, unit, points: pts };
          })
          .filter((s) => s.id && s.points.length > 0) as Series[];

        if (!alive) return;
        setSeries(s);
        return;
      }

      // rows[] legacy
      const arr = Array.isArray(j?.rows) ? (j.rows as any[]) : [];
      const parsed = arr
        .map((r) => ({
          as_of_date: String(r?.as_of_date ?? r?.date ?? ""),
          presentacion: Number(r?.presentacion),
          price_ars: Number(r?.price_ars ?? r?.price),
        }))
        .filter((r) => r.as_of_date && Number.isFinite(r.presentacion) && Number.isFinite(r.price_ars));

      if (!alive) return;
      setRows(parsed);
    })().catch((e) => {
      if (!alive) return;
      setErr(String(e?.message ?? e));
    });

    return () => {
      alive = false;
    };
  }, [itemKey]);

  const computedSeries = useMemo(() => {
    if (series) return series;
    if (!rows.length) return [];
    return ensureSeriesFromRows(rows);
  }, [series, rows]);

  const boundsAll = useMemo(() => calcBounds(computedSeries), [computedSeries]);

  const filteredSeries = useMemo(() => {
    if (!boundsAll) return computedSeries;
    const maxX = boundsAll.maxX;
    const minAllowed = daysAgoIso(maxX, rangeDays);
    if (!minAllowed) return computedSeries;

    return computedSeries
      .map((s) => ({ ...s, points: s.points.filter((p) => p.date >= minAllowed) }))
      .filter((s) => s.points.length > 0);
  }, [computedSeries, boundsAll, rangeDays]);

  const bounds = useMemo(() => calcBounds(filteredSeries), [filteredSeries]);

  const maxDate = useMemo(() => {
    const m = filteredSeries.map((s) => pickMaxDate(s.points)).filter(Boolean) as string[];
    return m.length ? m.sort().slice(-1)[0] : null;
  }, [filteredSeries]);

  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of filteredSeries) m.set(s.id, colorForSeriesId(s.id));
    return m;
  }, [filteredSeries]);

  const hoverBucket = useMemo(() => {
    if (!hoverIso) return null;
    return nearestByDate(filteredSeries, hoverIso);
  }, [hoverIso, filteredSeries]);

  const onMouseMove = (e: MouseEvent) => {
    const el = wrapRef.current;
    if (!el || !bounds) return;

    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const w = r.width;

    const { minX, maxX } = bounds;
    const a = new Date(minX).getTime();
    const b = new Date(maxX).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return;

    const t = a + (clamp(x, 0, w) / w) * (b - a);
    const d = new Date(t);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const iso = `${y}-${m}-${dd}`;

    setHoverX(clamp(x, 0, w));
    setHoverIso(iso);
  };

  const onMouseLeave = () => {
    setHoverX(null);
    setHoverIso(null);
  };

  if (err) {
    return (
      <div style={{ padding: 12, border: "1px solid rgba(0,0,0,.12)", borderRadius: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Error</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>{err}</div>
      </div>
    );
  }

  if (!filteredSeries.length) {
    return (
      <div style={{ padding: 12, border: "1px solid rgba(0,0,0,.12)", borderRadius: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Sin histórico.</div>
      </div>
    );
  }

  // Layout SVG (viewBox responsive)
  const W = 960;
  const H = 360;
  const padL = 64;
  const padR = 18;
  const padT = 18;
  const padB = 42;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const b = bounds!;
  const paths = filteredSeries.map((s) => ({
    id: s.id,
    label: s.label,
    unit: s.unit,
    stroke: colorMap.get(s.id) ?? "#111827",
    d: buildPath(s.points, b.minX, b.maxX, b.minY, b.maxY, innerW, innerH),
  }));

  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const t = i / yTicks; // 0..1 (top->bottom in screen)
    const v = b.minY + (1 - t) * (b.maxY - b.minY);
    return { t, v, y: t * innerH };
  });

  const tooltipStyle: React.CSSProperties = {
    position: "absolute",
    left: hoverX != null ? clamp(hoverX + 14, 8, 520) : 0,
    top: 10,
    pointerEvents: "none",
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 12,
    padding: "10px 12px",
    boxShadow: "0 12px 28px rgba(0,0,0,0.18)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    minWidth: 220,
    display: hoverBucket ? "block" : "none",
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ fontSize: 12, opacity: 0.8 }}>Rango:</div>
        <select
          value={rangeDays}
          onChange={(e) => setRangeDays(Number(e.target.value))}
          style={{ fontSize: 12, padding: "4px 6px" }}
        >
          <option value={7}>7 días</option>
          <option value={30}>30 días</option>
          <option value={90}>90 días</option>
          <option value={180}>180 días</option>
          <option value={365}>365 días</option>
        </select>

        <div style={{ marginLeft: "auto", fontSize: 12, opacity: 0.8 }}>
          {maxDate ? (
            <>
              Último dato: <code>{maxDate}</code>
            </>
          ) : null}
        </div>
      </div>

      <div
        ref={wrapRef}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        style={{
          position: "relative",
          border: "1px solid rgba(0,0,0,.12)",
          borderRadius: 12,
          padding: 10,
          overflow: "hidden",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        {/* Tooltip flotante */}
        <div style={tooltipStyle}>
          {hoverBucket ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.78)" }}>
                {hoverBucket.date}
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {hoverBucket.items.map(({ s, p }) => {
                  const c = colorMap.get(s.id) ?? "#111827";
                  return (
                    <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: c,
                          flex: "0 0 auto",
                          marginTop: 3,
                        }}
                      />
                      <div style={{ flex: 1, display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ fontSize: 12, opacity: 0.9 }}>{s.label}</div>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>
                          {fmtArs(p.value)} <span style={{ fontWeight: 600, opacity: 0.7 }}>{s.unit}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ display: "block" }}
        >
          <g transform={`translate(${padL},${padT})`}>
            {/* Grid + labels Y */}
            {yLabels.map((t) => (
              <g key={t.t}>
                <line x1={0} y1={t.y} x2={innerW} y2={t.y} stroke="rgba(0,0,0,.10)" />
                <text x={-12} y={t.y + 4} textAnchor="end" fontSize={11} fill="rgba(0,0,0,.72)">
                  {fmtArs(t.v)}
                </text>
              </g>
            ))}

            {/* Labels X */}
            <text x={0} y={innerH + 28} fontSize={11} fill="rgba(0,0,0,.72)">
              {b.minX}
            </text>
            <text x={innerW} y={innerH + 28} textAnchor="end" fontSize={11} fill="rgba(0,0,0,.72)">
              {b.maxX}
            </text>

            {/* Paths */}
            {paths.map((p) => (
              <path
                key={p.id}
                d={p.d}
                fill="none"
                stroke={p.stroke}
                strokeWidth={2.6}
                opacity={0.92}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}

            {/* Dots */}
            {filteredSeries.map((s) => {
              const c = colorMap.get(s.id) ?? "#111827";
              return (
                <g key={`dots:${s.id}`}>
                  {s.points.map((pt) => {
                    const x = dateToX(pt.date, b.minX, b.maxX, innerW);
                    const y = valToY(pt.value, b.minY, b.maxY, innerH);
                    return (
                      <circle
                        key={`${s.id}:${pt.date}`}
                        cx={x}
                        cy={y}
                        r={3.1}
                        fill={c}
                        opacity={0.95}
                      />
                    );
                  })}
                </g>
              );
            })}

            {/* Hover vertical line */}
            {hoverX != null ? (
              <line x1={(hoverX / (wrapRef.current?.getBoundingClientRect().width || 1)) * innerW} y1={0} x2={(hoverX / (wrapRef.current?.getBoundingClientRect().width || 1)) * innerW} y2={innerH} stroke="rgba(0,0,0,.28)" strokeDasharray="4 4" />
            ) : null}
          </g>
        </svg>
      </div>

      {/* Leyenda */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 12, opacity: 0.92 }}>
        {filteredSeries.map((s) => {
          const c = colorMap.get(s.id) ?? "#111827";
          return (
            <div key={s.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: c }} />
              <span>{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}