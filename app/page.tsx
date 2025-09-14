'use client';
import { useEffect, useState } from 'react';

type Row = {
  product_id:number; product_presentation_id:number; nombre:string;
  qty:number; uom:string|null; costo_ars:number|null;
  precio_sugerido_ars:number|null; fecha_costo:string|null;
};

export default function Page() {
  const [q,setQ] = useState('');
  const [rows,setRows] = useState<Row[]>([]);
  const [loading,setLoading] = useState(false);
  const [selected,setSelected] = useState<number[]>([]);
  const [applying,setApplying] = useState(false);

  const limit = 500;
  const [offset,setOffset] = useState(0);
  const [hasMore,setHasMore] = useState(true);

  async function fetchPage(newOffset:number, reset=false) {
    setLoading(true);
    const url = new URL('/api/price-list', window.location.origin);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(newOffset));
    if (q) url.searchParams.set('q', q);
    const res = await fetch(url.toString());
    const data: Row[] = await res.json();
    setRows(prev => reset ? data : [...prev, ...data]);
    setHasMore(data.length === limit);
    setLoading(false);
  }

  useEffect(() => { fetchPage(0, true); }, []);
  async function search() { setOffset(0); await fetchPage(0, true); }

  async function bulk(pct?:number, fix?:number){
    if(!selected.length) return;
    try{
      setApplying(true);
      const r = await fetch('/api/rules', {
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ productIds:selected, setPct:pct, setFixed:fix })
      });
      if(!r.ok) throw new Error(await r.text());
      await fetchPage(0, true); setOffset(0);
    } finally { setApplying(false); }
  }

  function toggleSelect(pid:number, checked:boolean){
    setSelected(prev => { const s=new Set(prev); checked?s.add(pid):s.delete(pid); return Array.from(s); });
  }

  return (
    <main className="p-4 max-w-6xl mx-auto space-y-3">
      <h1 className="text-2xl font-semibold">MGq Price Admin</h1>
      <div className="flex gap-2 items-center">
        <input className="border rounded px-3 py-2 w-full max-w-md"
               placeholder="Buscar por nombre o ID" value={q} onChange={e=>setQ(e.target.value)} />
        <button className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
                disabled={loading} onClick={search}>{loading?'Cargando...':'Buscar'}</button>
        <button className="px-4 py-2 rounded bg-gray-200 disabled:opacity-50"
                disabled={applying || selected.length===0}
                onClick={()=>bulk(30,0)}>{applying?'Aplicando...':'Aplicar 30% a seleccionados'}</button>
      </div>

      <div className="overflow-auto rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50"><tr>
            <th className="p-2">Sel</th><th className="p-2 text-left">Producto</th>
            <th className="p-2">Qty</th><th className="p-2">UOM</th>
            <th className="p-2">Costo</th><th className="p-2">Sugerido</th>
          </tr></thead>
          <tbody>
            {rows.map(r=>(
              <tr key={r.product_presentation_id} className="border-t">
                <td className="p-2"><input type="checkbox"
                  checked={selected.includes(r.product_id)}
                  onChange={e=>toggleSelect(r.product_id, e.target.checked)} /></td>
                <td className="p-2">{r.nombre}</td>
                <td className="p-2 text-center">{r.qty}</td>
                <td className="p-2 text-center">{r.uom ?? '-'}</td>
                <td className="p-2 text-right">{r.costo_ars ?? '-'}</td>
                <td className="p-2 text-right font-medium">{r.precio_sugerido_ars ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="py-3">
        <button className="px-4 py-2 rounded border disabled:opacity-50"
                disabled={loading || !hasMore}
                onClick={async()=>{ const next=offset+limit; setOffset(next); await fetchPage(next); }}>
          {loading ? 'Cargando…' : (hasMore ? 'Cargar más' : 'No hay más')}
        </button>
      </div>
    </main>
  );
}
