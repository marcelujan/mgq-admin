"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type Row = { as_of_date: string; presentacion: number; price_ars: number };

export default function PriceHistoryChart({ itemId }: { itemId: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);

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
      setRows(Array.isArray(j?.rows) ? j.rows : []);
    })();
  }, [itemId]);

  const series = useMemo(() => {
    // pivote: una línea por presentación
    const byDate = new Map<string, any>();
    for (const r of rows) {
      const d = r.as_of_date;
      if (!byDate.has(d)) byDate.set(d, { as_of_date: d });
      byDate.get(d)[`p_${r.presentacion}`] = r.price_ars;
    }
    const data = Array.from(byDate.values()).sort((a, b) =>
      String(a.as_of_date).localeCompare(String(b.as_of_date))
    );

    const pres = Array.from(new Set(rows.map((r) => r.presentacion))).sort((a, b) => a - b);
    return { data, pres };
  }, [rows]);

  if (err) return <div>Error: {err}</div>;
  if (rows.length === 0) return <div>Sin datos todavía.</div>;

  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={series.data}>
          <XAxis dataKey="as_of_date" />
          <YAxis />
          <Tooltip />
          <Legend />
          {series.pres.map((p) => (
            <Line
              key={p}
              type="monotone"
              dataKey={`p_${p}`}
              dot={false}
              connectNulls
              name={`Presentación ${p}`}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
