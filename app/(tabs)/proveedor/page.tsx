"use client";
import { useEffect, useMemo, useState } from "react";

export type ProveedorRow = {
  provAsterisk?: string; // Prov * (nombre del proveedor)
  provArticulo?: string; // Prov Artículo
  provPres?: string; // Prov Pres
  provUom?: string; // Prov UOM
  provCosto?: number | string | null; // Prov Costo
  provCostoUn?: number | string | null; // Prov CostoUn
  provAct?: boolean | string | null; // Prov Act
  provUrl?: string | null; // Prov URL
  provDesc?: string | null; // Prov Desc
  prov_g_ml?: number | string | null; // Prov [g/mL]
};

const columns: { key: keyof ProveedorRow; label: string }[] = [
  { key: "provAsterisk", label: "Prov *" },
  { key: "provArticulo", label: "Prov Artículo" },
  { key: "provPres", label: "Prov Pres" },
  { key: "provUom", label: "Prov UOM" },
  { key: "provCosto", label: "Prov Costo" },
  { key: "provCostoUn", label: "Prov CostoUn" },
  { key: "provAct", label: "Prov Act" },
  { key: "provUrl", label: "Prov URL" },
  { key: "provDesc", label: "Prov Desc" },
  { key: "prov_g_ml", label: "Prov [g/mL]" },
];

export default function ProveedorPage() {
  const [rows, setRows] = useState<ProveedorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [onlyAct, setOnlyAct] = useState(false);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q, activos: String(onlyAct), limit: String(limit), offset: String(offset) });
        const res = await fetch(`/api/proveedor?${params.toString()}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setRows(
          data.rows.map((r: any) => ({
            provAsterisk: r["Prov *"],
            provArticulo: r["Prov Artículo"],
            provPres: r["Prov Pres"],
            provUom: r["Prov UOM"],
            provCosto: r["Prov Costo"],
            provCostoUn: r["Prov CostoUn"],
            provAct: r["Prov Act"],
            provUrl: r["Prov URL"],
            provDesc: r["Prov Desc"],
            prov_g_ml: r["Prov [g/mL]"],
          }))
        );
        setTotal(data.total ?? 0);
        setError(null);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [q, onlyAct, limit, offset]);

  const page = useMemo(() => Math.floor(offset / limit) + 1, [offset, limit]);
  const pages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2 flex-wrap">
        <div className="grow">
          <h1 className="text-xl font-semibold">Proveedor</h1>
          <div className="text-xs opacity-70">{total} filas</div>
        </div>
        <input
          value={q}
          onChange={(e) => { setOffset(0); setQ(e.target.value); }}
          placeholder="Buscar proveedor o artículo…"
          className="border rounded-xl px-3 py-2 text-sm"
        />
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={onlyAct} onChange={(e) => { setOffset(0); setOnlyAct(e.target.checked); }} />
          Solo activos
        </label>
      </div>

      {loading ? (
        <div>Cargando…</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key as string} className="border px-2 py-1 text-left text-sm bg-gray-50">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  {columns.map((c) => (
                    <td key={c.key as string} className="border px-2 py-1 text-sm align-top">
                      {renderCell(r, c.key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 text-sm">
        <button disabled={offset===0} onClick={()=> setOffset(Math.max(0, offset - limit))} className="px-3 py-1 border rounded-xl disabled:opacity-50">Prev</button>
        <span>{page}/{pages}</span>
        <button disabled={offset+limit>=total} onClick={()=> setOffset(offset + limit)} className="px-3 py-1 border rounded-xl disabled:opacity-50">Next</button>
        <select value={limit} onChange={(e)=> { setOffset(0); setLimit(Number(e.target.value)); }} className="border rounded-xl px-2 py-1">
          {[25,50,100,200].map(n=> <option key={n} value={n}>{n}/página</option>)}
        </select>
      </div>
    </div>
  );
}

function renderCell(row: ProveedorRow, key: keyof ProveedorRow) {
  const v = row[key];
  if (key === "provUrl" && typeof v === "string" && v) {
    return (
      <a href={v} target="_blank" className="underline break-all">
        {v}
      </a>
    );
  }
  if (typeof v === "boolean") return v ? "Sí" : "No";
  return v ?? "";
}
