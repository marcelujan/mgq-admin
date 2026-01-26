"use client";

import React from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";

type Row = { date: string; presentacion: number; price_ars: number };

function groupToSeries(rows: Row[]) {
  // pivot: [{date, "pres_1": price, "pres_5": price, ...}]
  const byDate = new Map<string, any>();
  const presSet = new Set<number>();

  for (const r of rows) {
    presSet.add(r.presentacion);
    const key = r.date;
    const obj = byDate.get(key) ?? { date: key };
    obj[`pres_${r.presentacion}`] = r.price_ars;
    byDate.set(key, obj);
  }

  const presentaciones = Array.from(presSet.values()).sort((a, b) => a - b);
  const data = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  return { data, presentaciones };
}

export default function PriceHistoryChart({ itemId, days = 30 }: { itemId: number; days?: number }) {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let ok = true;
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/items/${itemId}/price-history?days=${days}`, { cache: "no-store" });
      const json = await res.json();
      if (!ok) return;
      setRows(json.rows ?? []);
      setLoading(false);
    })();
    return () => { ok = false; };
  }, [itemId, days]);

  if (loading) return <div>Cargando histórico…</div>;
  if (!rows.length) return <div>Sin datos aún (esperá a que corra el cron).</div>;

  const { data, presentaciones } = groupToSeries(rows);

  return (
    <div style={{ width: "100%", height: 360 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          {presentaciones.map((p) => (
            <Line
              key={p}
              type="monotone"
              dataKey={`pres_${p}`}
              dot={false}
              connectNulls={false}
              name={`Pres ${p}`}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
