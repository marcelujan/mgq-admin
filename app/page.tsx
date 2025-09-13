'use client';
import { useEffect, useState } from 'react';
type Row={product_id:number;product_presentation_id:number;nombre:string;qty:number;uom:string|null;costo_ars:number|null;precio_sugerido_ars:number|null;fecha_costo:string|null;};
export default function Page(){
  const [q,setQ]=useState(''); const [rows,setRows]=useState<Row[]>([]);
  const [loading,setLoading]=useState(false); const [selected,setSelected]=useState<number[]>([]);
  async function load(){ setLoading(true); const url=new URL('/api/price-list',location.origin); if(q) url.searchParams.set('q',q); const r=await fetch(url); setRows(await r.json()); setLoading(false); }
  useEffect(()=>{load();},[]);
  async function bulk(pct?:number,fix?:number){ if(!selected.length) return; await fetch('/api/rules',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({productIds:selected,setPct:pct,setFixed:fix})}); await load(); }
  return (<main className="p-4 max-w-6xl mx-auto space-y-3">
    <h1 className="text-2xl font-semibold">MGq Price Admin</h1>
    <div className="flex gap-2 items-center">
      <input className="border rounded px-3 py-2 w-full max-w-md" placeholder="Buscar por nombre o ID" value={q} onChange={e=>setQ(e.target.value)} />
      <button className="px-4 py-2 rounded bg-black text-white disabled:opacity-50" disabled={loading} onClick={load}>{loading?'Cargando...':'Buscar'}</button>
      <button className="px-4 py-2 rounded bg-gray-200" onClick={()=>bulk(30,0)}>Aplicar 30% a seleccionados</button>
    </div>
    <div className="overflow-auto rounded-xl border">
      <table className="min-w-full text-sm"><thead className="bg-gray-50"><tr>
        <th className="p-2">Sel</th><th className="p-2 text-left">Producto</th><th className="p-2">Qty</th><th className="p-2">UOM</th><th className="p-2">Costo</th><th className="p-2">Sugerido</th></tr></thead>
        <tbody>{rows.map(r=>(<tr key={r.product_presentation_id} className="border-t">
          <td className="p-2"><input type="checkbox" checked={selected.includes(r.product_id)} onChange={e=>{const s=new Set(selected); e.target.checked?s.add(r.product_id):s.delete(r.product_id); setSelected(Array.from(s));}}/></td>
          <td className="p-2">{r.nombre}</td><td className="p-2 text-center">{r.qty}</td><td className="p-2 text-center">{r.uom??'-'}</td>
          <td className="p-2 text-right">{r.costo_ars??'-'}</td><td className="p-2 text-right font-medium">{r.precio_sugerido_ars??'-'}</td>
        </tr>))}</tbody></table>
    </div></main>);
}