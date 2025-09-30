"use client";
import { useEffect, useMemo, useState } from "react";


type Row = {
  [""]?: null; // columna de acciones sin encabezado
  ["Prov *"]?: boolean | string | null;
  ["Prov Prov"]?: string | null;
  ["Prov Artículo"]?: string;
  ["Prov Pres"]?: number | string | null;
  ["Prov UOM"]?: string;
  ["Prov Costo"]?: number | string | null;
  ["Prov CostoUn"]?: number | string | null;
  ["Prov Act"]?: string | null;
  ["Prov URL"]?: string | null;
  ["Prov Desc"]?: string | null;
  ["Prov [g/mL]"]?: number | string | null;
    ["_prov_id"]?: number;

  ["_prov_id"]?: number;
};

const columns = [
  "Prov *",
  "Prov Prov",
  "Prov Artículo",
  "Prov Pres",
  "Prov UOM",
  "Prov Costo",
  "Prov CostoUn",
  "Prov Act",
  "Prov URL",
  "Prov Desc",
  "Prov [g/mL]",
  "",
] as const;

const nf0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
function sortRowsBy(list: Row[]): Row[] {
  return [...list].sort((a,b)=>{
    const A = String(a["Prov Artículo"] ?? "").localeCompare(String(b["Prov Artículo"] ?? ""));
    if (A !== 0) return A;
    const pa = Number(a["Prov Pres"] ?? 0);
    const pb = Number(b["Prov Pres"] ?? 0);
    return pa - pb;
  });
}


function toISODate(input: any): string | null {
  if (!input) return null;
  if (typeof input === "string") {
    // If already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
    // If comes like DD/MM/YYYY
    const m = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const dd = m[1].padStart(2, "0");
      const mm = m[2].padStart(2, "0");
      const yyyy = m[3];
      return `${yyyy}-${mm}-${dd}`;
    }
    // Try Date parse fallback
    const d = new Date(input);
    if (!isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth()+1).padStart(2,"0");
      const dd = String(d.getDate()).padStart(2,"0");
      return `${yyyy}-${mm}-${dd}`;
    }
    return null;
  }
  if (input instanceof Date && !isNaN(input.getTime())) {
    const yyyy = input.getFullYear();
    const mm = String(input.getMonth()+1).padStart(2,"0");
    const dd = String(input.getDate()).padStart(2,"0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function formatHumanDate(input: any): string {
  const iso = toISODate(input);
  if (!iso) return String(input ?? "");
  const [yyyy, mm, dd] = iso.split("-");
  return `${dd}/${mm}/${yyyy}`;
}


export default function ProveedorPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [onlyAct, setOnlyAct] = useState(true);
  const [limit, setLimit] = useState(100); // default 100
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorRow, setEditorRow] = useState<Row | null>(null);


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
          Solo favoritos
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
                  if (c === "") return (
                    <th key="__actions" className="border border-zinc-700 px-1 py-2 bg-zinc-700 text-zinc-100 sticky top-0 w-10"></th>
                  );
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
                      {renderCell(r, c, setRows, (row)=>{ setEditorRow(row); setEditorOpen(true); })}
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
        
      
      {/* Drawer de edición */}
      {editorOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditorOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-zinc-900 border-l border-zinc-800 shadow-2xl p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold">Editar fila</h2>
              <button onClick={() => setEditorOpen(false)} className="px-2 py-1 rounded hover:bg-zinc-800">Cerrar</button>
            </div>
            {editorRow ? (
              <EditForm
                row={editorRow}
                onClose={(updated) => {
                  setEditorOpen(false);
                  if (updated) {
                    if ((updated as any)._deleted && updated._prov_id) {
                      setRows(prev => prev.filter(r => r["_prov_id"] !== updated._prov_id));
                      return;
                    }
                    // refrescar en memoria
                    setRows(prev => sortRowsBy(prev.map(r => (r["_prov_id"] === updated._prov_id ? { ...r, ...updated } : r))));
                  }
                }}
              />
            ) : null}
          </div>
        </div>
      )}
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


function renderCell(row: Row, key: keyof Row, setRows: React.Dispatch<React.SetStateAction<Row[]>>, onEdit?: (row: Row)=>void) {
  const v = row[key];

  // Columna de acciones (sin encabezado)
  if (key === "") {
    return (
      <button onClick={() => onEdit && onEdit(row)} className="inline-flex items-center justify-center p-1 rounded hover:bg-zinc-700" title="Editar">
        <PencilIcon />
      </button>
    );
  }

  // Favorito (checkbox)
  if (key === "Prov *") {
    const checked = typeof v === 'boolean' ? v : v === 'true' || v === 't' || v === '1';
    return (
      <input
        type="checkbox"
        checked={!!checked}
        onChange={async (e) => {
          const next = e.target.checked;
          try {
            await fetch("/api/proveedor", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: row["_prov_id"], value: next }),
            });
            setRows((prev) => prev.map((r) => (r === row ? { r, ["Prov *"]: next } : r)));
          } catch (err) {
            setRows((prev) => prev.map((r) => (r === row ? { r, ["Prov *"]: checked } : r)));
            console.error("Error actualizando favorito:", err);
          }
        }}
      />
    );
  }

  // Solo lectura para UOM y densidad (edición en drawer)
  if (key === "Prov UOM") return (row["Prov UOM"] ?? "") as any;
  if (key === "Prov [g/mL]") {
    const num = typeof v === "number" ? v : Number(v ?? "");
    if (!isNaN(num)) return num.toFixed(2);
    return (v ?? "") as any;
  }

  // Formateos
  if ((key === "Prov Pres" || key === "Prov Costo" || key === "Prov CostoUn") && v != null && v !== "") {
    const num = typeof v === 'string' ? Number(v) : (v as number);
    if (!isNaN(num)) return nf0.format(Math.round(num));
  }
  // Fallback para costo unitario si viene vacío y UOM es GR o ML
  if (key === "Prov CostoUn" && (v == null || v === "")) {
    const costo = Number(row["Prov Costo"] ?? 0);
    const pres = Number(row["Prov Pres"] ?? 0);
    const uom = row["Prov UOM"];
    if (costo > 0 && pres > 0 && (uom === "GR" || uom === "ML")) {
      // convertir a costo por kilo/litro (multiplicar por 1000)
      const calc = Math.round((costo * 1000) / pres);
      return nf0.format(calc);
    }
  }
  if (key === "Prov Act" && v) {
    return formatHumanDate(v);
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
type EditPayload = {
  prov_id?: number;
  product_id?: number;
  prov_articulo?: string;
  prov_presentacion?: number | null;
  prov_uom?: string | null;
  prov_costo?: number | null;
  prov_costoun?: number | null;
  prov_act?: string | null;
  prov_url?: string | null;
  prov_descripcion?: string | null;
  prov_densidad?: number | null;
  prov_favoritos?: boolean | null;
};

function fieldVal(v:any){ return v === undefined ? "" : (v ?? ""); }


function EditForm({ row, onClose }: { row: Row, onClose: (updated?: any)=>void }){
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  if (saving) return;
  setSaving(true);
  try {
    const fd = new FormData(e.currentTarget);
    const payload: any = {};
    fd.forEach((val, key) => {
      // normaliza checkbox
      if (val === "on") payload[key] = true;
      else payload[key] = val as any;
    });
    // mapeos explícitos (por si faltan)
    payload.prov_id = row["_prov_id"];
    payload.prov_proveedor = payload.prov_proveedor ?? (row["Prov Prov"] ?? null);
    // para checkbox prov_favoritos: si no vino en fd => false
    if (typeof payload.prov_favoritos === "undefined") payload.prov_favoritos = false;

    const res = await fetch("/api/proveedor/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || json?.error) throw new Error(json.error || "Error al guardar");

    // Reflejar en la tabla inmediatamente
    const nextFav = !!payload.prov_favoritos;
    const nextProvProv = (payload.prov_proveedor ?? row["Prov Prov"]) as any;
    setRows(prev => prev.map(r => {
      if (r === row) {
        return {
          ...r,
          ["Prov *"]: nextFav,
          ["Prov Prov"]: nextProvProv,
          ["Prov Artículo"]: payload.prov_articulo ?? r["Prov Artículo"],
          ["Prov Pres"]: payload.prov_presentacion ?? r["Prov Pres"],
          ["Prov UOM"]: payload.prov_uom ?? r["Prov UOM"],
          ["Prov Costo"]: payload.prov_costo ?? r["Prov Costo"],
          ["Prov Act"]: payload.prov_act ?? r["Prov Act"],
          ["Prov URL"]: payload.prov_url ?? r["Prov URL"],
          ["Prov Desc"]: payload.prov_descripcion ?? r["Prov Desc"],
          ["Prov [g/mL]"]: payload.prov_densidad ?? r["Prov [g/mL]"],
        } as any;
      }
      return r;
    }));

    onClose();
  } catch (err: any) {
    alert(err.message || String(err));
  } finally {
    setSaving(false);
  }
}


function PencilIcon(){
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/>
      <path d="M20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/>
    </svg>
  );
}
