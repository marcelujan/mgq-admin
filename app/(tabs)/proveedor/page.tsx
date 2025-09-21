"use client";
import { useEffect, useMemo, useState } from "react";

type Row = {
  ["Prov *"]?: boolean | string | null;
  ["Prov Artículo"]?: string;
  ["Prov Pres"]?: number | string | null;
  ["Prov UOM"]?: string;
  ["Prov Costo"]?: number | string | null;
  ["Prov CostoUn"]?: number | string | null;
  ["Prov Act"]?: string | null;
  ["Prov URL"]?: string | null;
  ["Prov Desc"]?: string | null;
  ["Prov [g/mL]"]?: number | string | null;
};

const columns = [
  "Prov *",
  "Prov Artículo",
  "Prov Pres",
  "Prov UOM",
  "Prov Costo",
  "Prov CostoUn",
  "Prov Act",
  "Prov URL",
  "Prov Desc",
  "Prov [g/mL]",
] as const;

const nf0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

export default function ProveedorPage() {
  const [rows, setRows] = useState<Row[]>([]);
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
        setRows(data.rows);
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
  const start = useMemo(() => (total === 0 ? 0 : offset + 1), [offset, total]);
  const end = useMemo(() => Math.min(offset + limit, total), [offset, limit, total]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Buscador a la izquierda */}
        <input
          value={q}
          onChange={(e) => { setOffset(0); setQ(e.target.value); }}
          placeholder="Buscar artículo…"
          className="border border-zinc-700 bg-zinc-800 text-zinc-100 rounded-xl px-3 py-2 text-sm placeholder-zinc-400"
        />
        {/* Luego Solo activos */}
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={onlyAct} onChange={(e) => { setOffset(0); setOnlyAct(e.target.checked); }} />
          Solo activos
        </label>
        {/* Paginación a la derecha */}
        <div className="ml-auto flex items-center gap-2 text-sm">
          <button disabled={offset===0} onClick={()=> setOffset(Math.max(0, offset - limit))} className="px-3 py-1 border rounded-xl disabled:opacity-50 border-zinc-700 bg-zinc-800 hover:bg-zinc-700">Prev</button>
          <button disabled={offset+limit>=total} onClick={()=> setOffset(offset + limit)} className="px-3 py-1 border rounded-xl disabled:opacity-50 border-zinc-700 bg-zinc-800 hover:bg-zinc-700">Next</button>
          <select value={limit} onChange={(e)=> { setOffset(0); setLimit(Number(e.target.value)); }} className="border rounded-xl px-2 py-1 border-zinc-700 bg-zinc-800">
            {[25,50,100,200].map(n=> <option key={n} value={n}>{n}/página</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div>Cargando…</div>
      ) : error ? (
        <div className="text-red-400">{error}</div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c} className="border border-zinc-700 px-2 py-2 text-left bg-zinc-700 text-zinc-100 sticky top-0">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-zinc-800">
                  {columns.map((c) => (
                    <td key={c} className="border border-zinc-800 px-2 py-2 align-top">
                      {renderCell(r, c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Intervalo de filas */}
      <div className="flex items-center justify-between text-sm">
        <div className="opacity-80">{total === 0 ? "Sin resultados" : `Mostrando ${start}–${end} de ${total}`}</div>
        <div className="opacity-50">Límite: {limit}/página</div>
      </div>
    </div>
  );
}

function LinkIcon(){
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M13.5 6H17a5 5 0 010 10h-3.5"/>
      <path d="M10.5 18H7a5 5 0 010-10h3.5"/>
      <path d="M8 12h8"/>
    </svg>
  );
}

function DownloadIcon(){
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M12 3v10m0 0l-3.5-3.5M12 13l3.5-3.5" stroke="currentColor" strokeWidth="1" fill="none"/>
      <path d="M5 17h14v3H5z"/>
    </svg>
  );
}

function slugify(s: string){
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function downloadTxt(content: string, nameHint?: string | null){
  const blob = new Blob([content || ""], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (nameHint ? slugify(nameHint) : "descripcion") + ".txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderCell(row: Row, key: keyof Row) {
  const v = row[key];
  if (key === "Prov *") {
    const checked = typeof v === 'boolean' ? v : v === 'true' || v === 't' || v === '1';
    return <input type="checkbox" checked={!!checked} readOnly />;
  }
  if ((key === "Prov Pres" || key === "Prov Costo" || key === "Prov CostoUn") && v != null && v !== "") {
    const num = typeof v === 'string' ? Number(v) : (v as number);
    if (!isNaN(num)) return nf0.format(Math.round(num));
  }
  if (key === "Prov Act" && typeof v === 'string' && v) {
    const dt = new Date(v);
    return dt.toLocaleDateString('es-AR');
  }
  if (key === "Prov URL" && typeof v === "string" && v) {
    return (
      <a href={v} target="_blank" className="inline-flex items-center justify-center p-1 rounded hover:bg-zinc-700" title={v}>
        <LinkIcon />
      </a>
    );
  }
  if (key === "Prov Desc") {
    const txt = (row["Prov Desc"] as string) || "";
    const nameHint = (row["Prov Artículo"] as string) || "descripcion";
    return (
      <button
        onClick={() => downloadTxt(txt, nameHint)}
        className="inline-flex items-center justify-center p-1 rounded hover:bg-zinc-700"
        title="Descargar descripción (.txt)"
      >
        <DownloadIcon />
      </button>
    );
  }
  if (typeof v === "boolean") return v ? "Sí" : "No";
  return (v ?? "") as any;
}