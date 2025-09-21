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
  ["_product_id"]?: number;
  ["_pp_id"]?: number;
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
  const [limit, setLimit] = useState(100); // default 100
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q, activos: String(onlyAct), limit: String(limit), offset: String(offset) });
        const res = await fetch(`/api/proveedor?${params.toString()}`, { signal: controller.signal });
        if (!res.ok) {
          let msg = `HTTP ${res.status}`;
          try {
            const j = await res.json();
            if (j?.error) msg = j.error;
          } catch {}
          throw new Error(msg);
        }
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

  const start = useMemo(() => (total === 0 ? 0 : offset + 1), [offset, total]);
  const end = useMemo(() => Math.min(offset + limit, total), [offset, limit, total]);

  return (
    <div className="space-y-4">
      {/* Toolbar superior */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={q}
          onChange={(e) => { setOffset(0); setQ(e.target.value); }}
          placeholder="Buscar artículo…"
          className="border border-zinc-700 bg-zinc-800 text-zinc-100 rounded-xl px-3 py-2 text-sm placeholder-zinc-400"
        />
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={onlyAct} onChange={(e) => { setOffset(0); setOnlyAct(e.target.checked); }} />
          Solo activos
        </label>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <button disabled={offset===0} onClick={()=> setOffset(Math.max(0, offset - limit))} className="px-3 py-1 border rounded-xl disabled:opacity-50 border-zinc-700 bg-zinc-800 hover:bg-zinc-700">Prev</button>
          <button disabled={offset+limit>=total} onClick={()=> setOffset(offset + limit)} className="px-3 py-1 border rounded-xl disabled:opacity-50 border-zinc-700 bg-zinc-800 hover:bg-zinc-700">Next</button>
          {/* Intervalo a la derecha de Prev/Next */}
          <span className="opacity-80">{total === 0 ? "Sin resultados" : `Mostrando ${start}–${end} de ${total}`}</span>
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
                {columns.map((c) => {
                  const [top, bottom] = splitHeader(c);
                  return (
                    <th key={c} className="border border-zinc-700 px-2 py-2 text-center bg-zinc-700 text-zinc-100 sticky top-0">
                      <div className="leading-none">{top}</div>
                      <div className="leading-tight opacity-90 text-xs mt-1">{bottom}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-zinc-800">
                  {columns.map((c) => (
                    <td key={c} className="border border-zinc-800 px-2 py-2 align-top text-center">
                      {renderCell(r, c, setRows)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer: solo selector de tamaño de página a la derecha */}
      <div className="flex items-center justify-end text-sm">
        <select value={limit} onChange={(e)=> { setOffset(0); setLimit(Number(e.target.value)); }} className="border rounded-xl px-2 py-1 border-zinc-700 bg-zinc-800">
          {[50,100,200,500].map(n=> <option key={n} value={n}>{n}/página</option>)}
        </select>
      </div>
    </div>
  );
}

function splitHeader(label: string): [string, string] {
  if (label === "Prov *") return ["Prov", "*"];
  if (label.startsWith("Prov ")) return ["Prov", label.slice(5)];
  return ["Prov", label.replace(/^Prov\\s*/,"") || label];
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

async function updateRow(payload: any){
  await fetch("/api/proveedor/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function renderCell(row: Row, key: keyof Row, setRows: React.Dispatch<React.SetStateAction<Row[]>>) {
  const v = row[key];
  if (key === "Prov *") {
    const checked = typeof v === 'boolean' ? v : v === 'true' || v === 't' || v === '1';
    return <input type="checkbox" checked={!!checked} readOnly />;
  }
  if (key === "Prov UOM") {
    const val = (v as string) || "GR";
    return (
      <select
        value={val}
        onChange={async (e) => {
          const human = e.target.value as "GR" | "ML" | "UN";
          setRows((prev) => prev.map(r => r === row ? { ...r, ["Prov UOM"]: human } : r));
          await updateRow({ pp_id: row["_pp_id"], uom: human });
        }}
        className="border border-zinc-700 bg-zinc-800 text-zinc-100 rounded px-2 py-1"
      >
        <option value="GR">GR</option>
        <option value="ML">ML</option>
        <option value="UN">UN</option>
      </select>
    );
  }
  if (key === "Prov [g/mL]") {
    const val = typeof v === "number" ? v : Number(v || 1);
    return (
      <input
        type="number"
        step="0.01"
        min="0"
        value={val.toFixed(2)}
        onChange={async (e) => {
          const num = Number(e.target.value.replace(',', '.'));
          setRows((prev) => prev.map(r => r === row ? { ...r, ["Prov [g/mL]"]: num } : r));
          await updateRow({ product_id: row["_product_id"], gml: num });
        }}
        className="w-24 border border-zinc-700 bg-zinc-800 text-zinc-100 rounded px-2 py-1 text-right"
      />
    );
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