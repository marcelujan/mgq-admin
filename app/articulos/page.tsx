"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type FormulaLine = { id:number; name:string; qty:number; uom:string|null; is_enabled:boolean };
type Sale = {
  id:number;
  vend_name:string|null;
  vend_pres:number|null;
  vend_uom:string|null;
  is_enabled:boolean;
  is_formula:boolean;
  formula_lines?: FormulaLine[];
};
type Row = {
  product_id:number;
  product_presentation_id:number;
  prod_name:string;
  prov_qty:number|null;
  prov_uom:string|null;
  density:number|null;
  provider_enabled:boolean;
  sales: Sale[];
};

export default function ArticulosPage(){
  const router = useRouter();
  const qs = useSearchParams();
  const [showProv, setShowProv] = useState(qs.get("prov") !== "0");
  const [showSales, setShowSales] = useState(qs.get("ventas") !== "0");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string|null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({}); // por presentationId

  // sync query string para mantener UNA sola URL
  useEffect(()=>{
    const p = new URLSearchParams(qs.toString());
    p.set("prov", showProv ? "1" : "0");
    p.set("ventas", showSales ? "1" : "0");
    router.replace(`/articulos?${p.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[showProv, showSales]);

  useEffect(()=>{
    (async()=>{
      setLoading(true); setErr(null);
      try{
        const r = await fetch("/api/catalog", {cache:"no-store"});
        if(!r.ok) throw new Error(`GET /api/catalog → ${r.status}`);
        const j = await r.json();
        setRows(Array.isArray(j?.rows) ? j.rows : []);
      }catch(e:any){ setErr(String(e?.message ?? e)); }
      finally{ setLoading(false); }
    })();
  },[]);

  async function toggleSalesForPresentation(presentationId:number, enable:boolean){
    try{
      const r = await fetch(`/api/sales-items/by-presentation/${presentationId}`, {
        method:"PATCH", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ is_enabled: enable })
      });
      if(!r.ok) throw new Error(`PATCH by-presentation → ${r.status}`);
      // optimista:
      setRows(rs => rs.map(row =>
        row.product_presentation_id !== presentationId ? row : ({
          ...row,
          sales: row.sales.map(s => ({...s, is_enabled: enable}))
        })
      ));
    }catch(e){ alert(String(e)); }
  }

  async function toggleFormulaLine(salesItemId:number, lineId:number, enable:boolean){
    try{
      const r = await fetch(`/api/sales-items/${salesItemId}/formula-lines/${lineId}`, {
        method:"PATCH", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ is_enabled: enable })
      });
      if(!r.ok) throw new Error(`PATCH formula-line → ${r.status}`);
      // optimista:
      setRows(rs => rs.map(row => ({
        ...row,
        sales: row.sales.map(s => s.id!==salesItemId ? s : ({
          ...s,
          formula_lines: (s.formula_lines||[]).map(fl => fl.id!==lineId ? fl : ({...fl, is_enabled: enable}))
        }))
      })));
    }catch(e){ alert(String(e)); }
  }

  const cols = useMemo(()=>({
    prov: [
      { key:"prov_qty",   label:"Prov Pres", fn:(r:Row)=> r.prov_qty == null ? "—" : Number.isInteger(r.prov_qty) ? String(r.prov_qty) : String(r.prov_qty).replace(/\.0+$/,"") },
      { key:"prov_uom",   label:"UOM",      fn:(r:Row)=> r.prov_uom ?? "—" },
      { key:"density",    label:"Dens.",    fn:(r:Row)=> r.density ?? "—" },
      { key:"provider_enabled", label:"Prov Activo", fn:(r:Row)=> r.provider_enabled ? "Sí" : "No" },
    ],
    sales: [
      { key:"sales_count", label:"Ventas", fn:(r:Row)=> r.sales.length },
    ]
  }),[]);

  if(loading) return <div className="p-4 text-sm text-zinc-400">Cargando…</div>;
  if(err) return <div className="p-4 text-sm text-red-500">{err}</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-6">
        <div className="text-lg font-semibold">Catálogo unificado</div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showProv} onChange={e=>setShowProv(e.target.checked)}/>
          <span>Mostrar columnas de proveedor</span>
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showSales} onChange={e=>setShowSales(e.target.checked)}/>
          <span>Mostrar columnas de venta</span>
        </label>
      </div>

      <div className="border rounded-md overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-900/20">
            <tr>
              <th className="p-2 text-left">Producto</th>
              {showProv && cols.prov.map(c=>(
                <th key={c.key} className="p-2 text-left">{c.label}</th>
              ))}
              {showSales && <th className="p-2 text-left">Acciones de venta</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(row=>{
              const isOpen = !!expanded[row.product_presentation_id];
              return (
                <React.Fragment key={row.product_presentation_id}>
                  <tr className="border-t border-zinc-800 align-top">
                    <td className="p-2">
                      <div className="font-medium">{row.prod_name}</div>
                      <div className="text-[11px] text-zinc-500">
                        prod {row.product_id} · pres {row.product_presentation_id}
                      </div>
                      {showSales && (
                        <button
                          onClick={()=> setExpanded(s=>({ ...s, [row.product_presentation_id]: !isOpen }))}
                          className="mt-1 text-xs underline"
                        >
                          {isOpen ? "Ocultar ventas" : `Mostrar ventas (${row.sales.length})`}
                        </button>
                      )}
                    </td>

                    {showProv && cols.prov.map(c=>(
                      <td key={c.key} className="p-2">{c.fn(row) as any}</td>
                    ))}

                    {showSales && (
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <button
                            className="px-2 py-1 border rounded-md text-xs"
                            onClick={()=>toggleSalesForPresentation(row.product_presentation_id, true)}
                          >
                            Activar ventas
                          </button>
                          <button
                            className="px-2 py-1 border rounded-md text-xs"
                            onClick={()=>toggleSalesForPresentation(row.product_presentation_id, false)}
                          >
                            Desactivar ventas
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>

                  {/* Subtabla de ventas */}
                  {showSales && isOpen && (
                    <tr className="border-t border-zinc-900/40 bg-zinc-900/10">
                      <td colSpan={1 + (showProv ? cols.prov.length : 0) + 1} className="p-2">
                        {row.sales.length === 0 ? (
                          <div className="text-xs text-zinc-500">Sin ventas asociadas.</div>
                        ) : (
                          <div className="space-y-3">
                            {row.sales.map(sale=>(
                              <div key={sale.id} className="border rounded-md p-2">
                                <div className="flex items-center justify-between">
                                  <div className="font-medium">
                                    {sale.vend_name ?? "(sin nombre)"} · {sale.vend_pres ?? "—"} {sale.vend_uom ?? ""}
                                    <span className={`ml-2 text-[11px] px-1.5 py-0.5 rounded ${sale.is_enabled ? "bg-green-600/20 text-green-400" : "bg-zinc-700/30 text-zinc-300"}`}>
                                      {sale.is_enabled ? "Activo" : "Inactivo"}
                                    </span>
                                    {sale.is_formula && <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-300">Formulado</span>}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {/* activar/desactivar ese salesItem individual si te sirve */}
                                    {/* … */}
                                  </div>
                                </div>

                                {sale.is_formula && (sale.formula_lines?.length ?? 0) > 0 && (
                                  <div className="mt-2">
                                    <div className="text-xs text-zinc-500 mb-1">Componentes</div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                      {sale.formula_lines!.map(fl=>(
                                        <div key={fl.id} className="border rounded p-2 flex items-center justify-between">
                                          <div className="text-xs">
                                            <div className="font-medium">{fl.name}</div>
                                            <div className="text-[11px] text-zinc-500">{fl.qty} {fl.uom ?? ""}</div>
                                          </div>
                                          <label className="inline-flex items-center gap-2 text-xs">
                                            <input
                                              type="checkbox"
                                              checked={fl.is_enabled}
                                              onChange={(e)=>toggleFormulaLine(sale.id, fl.id, e.target.checked)}
                                            />
                                            <span>Activo</span>
                                          </label>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
