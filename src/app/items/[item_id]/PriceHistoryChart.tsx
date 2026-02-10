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

  if (!minX || !maxX || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return null;
  }

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

function buildPath(points: SeriesPoint[], minX: string, maxX: string, minY: number, maxY: number, width: number, height: number) {
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

function uniqDates(series: Series[]): string[] {
  const set = new Set<string>();
  for (const s of series) for (const p of s.points) if (p?.date) set.add(p.date);
  return Array.from(set).sort();
}

function nearestPoint(series: Series[], targetDate: string) {
  let best: { s: Series; p: SeriesPoint; dt: number } | null = null;
  const t = new Date(targetDate).getTime();
  if (!Number.isFinite(t)) return null;

  for (const s of series) {
    for (const p of s.points) {
      const pt = new Date(p.date).getTime();
      if (!Number.isFinite(pt)) continue;
      const dt = Math.abs(pt - t);
      if (!best || dt < best.dt) best = { s, p, dt };
    }
  }
  return best;
}

type Props = {
  itemKey: string;
};

export default function PriceHistoryChart({ itemKey }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [series, setSeries] = useState<Series[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState<number>(90);

  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      setErr(null);
      setSeries(null);
      setRows([]);

      // CAMBIO: no encodear itemKey. Puede venir como "p:231" o ya encoded "p%3A231".
      const res = await fetch(`/api/items/${itemKey}/price-history`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));

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
                    const date = String(p?.d ?? p?.date ?? "");
                    const value = safeNum(p?.y ?? p?.value);
                    if (!date || value == null) return null;
                    return { date, value };
                  })
                  .filter(Boolean) as SeriesPoint[]
              : [];
            return { id, label, unit, points: pts };
          })
          .filter((s) => s.id && s.points.length > 0) as Series[];

        if (!alive) return;
        setSeries(s);
        return;
      }

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

  const bounds = useMemo(() => calcBounds(computedSeries), [computedSeries]);
  const dates = useMemo(() => uniqDates(computedSeries), [computedSeries]);

  const filteredSeries = useMemo(() => {
    if (!bounds) return computedSeries;
    const maxX = bounds.maxX;
    const minAllowed = daysAgoIso(maxX, rangeDays);
    if (!minAllowed) return computedSeries;

    return computedSeries
      .map((s) => ({
        ...s,
        points: s.points.filter((p) => p.date >= minAllowed),
      }))
      .filter((s) => s.points.length > 0);
  }, [computedSeries, bounds, rangeDays]);

  const filteredBounds = useMemo(() => calcBounds(filteredSeries), [filteredSeries]);

  const maxDate = useMemo(() => {
    const m = filteredSeries.map((s) => pickMaxDate(s.points)).filter(Boolean) as string[];
    return m.length ? m.sort().slice(-1)[0] : null;
  }, [filteredSeries]);

  const onMouseMove = (e: MouseEvent) => {
    const el = wrapRef.current;
    if (!el || !filteredBounds) return;

    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const w = r.width;

    const { minX, maxX } = filteredBounds;
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
    setHoverDate(iso);
  };

  const onMouseLeave = () => {
    setHoverX(null);
    setHoverDate(null);
  };

  const hoverInfo = useMemo(() => {
    if (!hoverDate) return null;
    return nearestPoint(filteredSeries, hoverDate);
  }, [hoverDate, filteredSeries]);

  if (err) {
    return (
      <div style={{ padding: 12, border: "1px solid rgba(0,0,0,.1)", borderRadius: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Error</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>{err}</div>
      </div>
    );
  }

  if (!filteredSeries.length) {
    return (
      <div style={{ padding: 12, border: "1px solid rgba(0,0,0,.1)", borderRadius: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Sin histórico.</div>
      </div>
    );
  }

  const W = 900;
  const H = 320;
  const padL = 48;
  const padR = 16;
  const padT = 16;
  const padB = 28;

  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const b = filteredBounds!;
  const paths = filteredSeries.map((s) => ({
    id: s.id,
    label: s.label,
    unit: s.unit,
    d: buildPath(s.points, b.minX, b.maxX, b.minY, b.maxY, innerW, innerH),
  }));

  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const t = i / yTicks;
    const v = b.minY + (1 - t) * (b.maxY - b.minY);
    return { t, v, y: padT + t * innerH };
  });

  const xLabelLeft = b.minX;
  const xLabelRight = b.maxX;

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
          border: "1px solid rgba(0,0,0,.1)",
          borderRadius: 10,
          padding: 10,
          overflowX: "auto",
        }}
      >
        <svg width={W} height={H} style={{ display: "block" }}>
          <g transform={`translate(${padL},${padT})`}>
            {yLabels.map((t) => (
              <g key={t.t}>
                <line x1={0} y1={t.t * innerH} x2={innerW} y2={t.t * innerH} stroke="rgba(0,0,0,.08)" />
                <text
                  x={-10}
                  y={t.t * innerH + 4}
                  textAnchor="end"
                  fontSize={11}
                  fill="rgba(0,0,0,.7)"
                >
                  {fmtArs(t.v)}
                </text>
              </g>
            ))}

            <text x={0} y={innerH + 22} fontSize={11} fill="rgba(0,0,0,.7)">
              {xLabelLeft}
            </text>
            <text x={innerW} y={innerH + 22} textAnchor="end" fontSize={11} fill="rgba(0,0,0,.7)">
              {xLabelRight}
            </text>

            {paths.map((p) => (
              <path key={p.id} d={p.d} fill="none" stroke="currentColor" strokeWidth={2} opacity={0.85} />
            ))}

            {hoverX != null ? (
              <line
                x1={hoverX}
                y1={0}
                x2={hoverX}
                y2={innerH}
                stroke="rgba(0,0,0,.25)"
                strokeDasharray="4 4"
              />
            ) : null}
          </g>
        </svg>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 12, opacity: 0.85 }}>
        {filteredSeries.map((s) => (
          <div key={s.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: "currentColor", opacity: 0.75 }} />
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      {hoverInfo ? (
        <div style={{ fontSize: 12, opacity: 0.9 }}>
          <code>{hoverDate}</code> · {hoverInfo.s.label}: <b>{fmtArs(hoverInfo.p.value)}</b> {hoverInfo.s.unit}
        </div>
      ) : null}
    </div>
  );
}