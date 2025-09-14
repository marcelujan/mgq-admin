'use client';
import { useEffect, useState } from 'react';

type Row = {
  product_id:number; product_presentation_id:number; nombre:string;
  qty:number; uom:string|null; costo_ars:number|null;
  precio_sugerido_ars:number|null; fecha_costo:string|null;
  enabled?: boolean;
};

export default function Page(){
  const [q,setQ]=useState(''); const [rows,setRows]=useState<Row[]>([]);
  const [loading,setLoading]=useState(false);
  // filtros
  const [uom,setUom]=useState(''); const [minQty,setMinQty]=useState(''); const [maxQty,setMaxQty]=useState('');
  const [onlyEnabled,setOnlyEnabled]=useState(true);  // “Solo activos” por defecto
  const [hasCost,setHasCost]=useState(false);

  const limit=500; const [offset,setOffset]=useState(0); const [hasMore,setHasMore]=useState(true);

  async function fetchPage(newOffset:number, reset=false){
    setLoading(true);
    const ctl = new AbortController(); const t=setTimeout(()=>ctl.abort(),15000);
    try{
      const url = new URL('/api/price-list', window.location.origin);
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('offset', String(newOffset));
      if(q) url.searchParams.set('q', q);
      if(uom) url.searchParams.set('uom', uom);
      if(minQty) url.searchParams.set('min_qty', minQty);
      if(maxQty) url.searchParams.set('max_qty', maxQty);
      if(hasCost) url.searchParams.set('has_cost','1');
      if(!onlyEnabled) url.searchParams.set('show_all','1');

      const res = await fetch(url.toString(), { signal: ctl.signal });
      if(!res.ok) throw new Error(await res.text());
      const data: Row[] = await res.json();
      setRows(prev => reset ? data : [...prev, ...data]);
      setHasMore(data.length === limit);
    } catch(e:any){
      console.error(e); alert("Error cargando lista: " + (e?.message ?? e));
    } finally { clearTimeout(t); setLoading(false); }
  }

  useEffect(()=>{ fetchPage(0,true); },[]);
  async function search(){ setOffset(0); await fetchPage(0,true); }
  useEffect(()=>{ search(); /* recarga al cambiar “Solo activos” */ },[onlyEnabled]);

  async function toggleEnabled(pid:number,val:boolean){
    await fetch('/api/enabled',{method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({productId:pid, enabled:val})});
    setRows(prev=>prev.map(r=>r.product_id===pid?{...r,enabled:val}:r));
  }

  return (
    <main className="p-4 max-w-7xl mx-auto space-y-3">
      <h1 className="text-2xl font-semibold">MGq Price Admin</h1>

      {/* filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <input className="border rounded px-3 py-2 w-64" placeholder="Buscar por nombre o ID"
               value={q} onChange={e=>setQ(e.target.value)} />
        <input className="border rounded px-2 py-2 w-24" placeholder="UOM (UN)"
               value={uom} onChange={e=>setUom(e.target.value.toUpperCase())}/>
        <input className="border rounded px-2 py-2 w-28" placeholder="Qty ≥"
               value={minQty} onChange={e=>setMinQty(e.target.value)}/>
        <input className="border rounded px-2 py-2 w-28" placeholder="Qty ≤"
               value={maxQty} onChange={e=>setMaxQty(e.target.value)}/>
        <label className="px-2"><input type="checkbox" checked={onlyEnabled}
               onChange={e=>setOnlyEnabled(e.target.checked)}/> Solo activos</label>
        <label className="px-2"><input type="checkbox" checked={hasCost}
               onChange={e=>setHasCost(e.target.checked)}/> Con costo</label>
        <button className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
                disabled={loading} onClick={search}>
          {loading?'Cargando...':'Aplicar filtros'}
        </button>
      </div>

      <div className="overflow-auto rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-white text-black">
            <tr>
              <th className="p-2">Hab</th>
              <th className="p-2 text-left">Producto</th>
              <th className="p-2">Qty</th>
              <th className="p-2">UOM</th>
              <th className="p-2">Costo</th>
              <th className="p-2">Sugerido</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r=>(
              <tr key={r.product_presentation_id} className="border-t">
                <td className="p-2 text-center">
                  <input type="checkbox" checked={!!r.enabled}
                         onChange={e=>toggleEnabled(r.product_id, e.target.checked)} />
                </td>
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
                disabled={loading||!hasMore}
                onClick={async()=>{ const next=offset+limit; setOffset(next); await fetchPage(next); }}>
          {loading?'Cargando…':(hasMore?'Cargar más':'No hay más')}
        </button>
      </div>
    </main>
  );
}
