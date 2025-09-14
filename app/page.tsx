'use client';
import { useEffect, useState } from 'react';

type Row = {
  product_id: number;
  product_presentation_id: number;
  nombre: string;
  qty: number;                     // Presentación del proveedor (enteros)
  costo_ars: number | null;
  chosen_uom?: string | null;      // UOM elegida en app
  enabled?: boolean;               // en lista activa (whitelist)
};

export default function Page() {
  // datos
  const [rows, setRows] = useState<Row[]>([]);
  const [allowedUoms, setAllowedUoms] = useState<string[]>([]);

  // filtros / estado
  const [q, setQ] = useState('');
  const [minQty, setMinQty] = useState('');
  const [maxQty, setMaxQty] = useState('');
  const [onlyEnabled, setOnlyEnabled] = useState(true); // Solo activos por defecto
  const [hasCost, setHasCost] = useState(false);
  const [loading, setLoading] = useState(false);

  // paginado
  const limit = 500;
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // formateador: miles con punto y sin decimales
  const fmtInt = (n: number | null | undefined) =>
    n == null ? '-' : new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n);

  // cargar opciones UOM una vez
  useEffect(() => {
    fetch('/api/uoms').then(r => r.json()).then(setAllowedUoms).catch(console.error);
  }, []);

  async function fetchPage(newOffset: number, reset = false) {
    setLoading(true);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const url = new URL('/api/price-list', window.location.origin);
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('offset', String(newOffset));
      if (q) url.searchParams.set('q', q);
      if (minQty) url.searchParams.set('min_qty', minQty);
      if (maxQty) url.searchParams.set('max_qty', maxQty);
      if (hasCost) url.searchParams.set('has_cost', '1');
      if (!onlyEnabled) url.searchParams.set('show_all', '1');

      const res = await fetch(url.toString(), { signal: ctl.signal });
      if (!res.ok) throw new Error(await res.text());
      const data: Row[] = await res.json();

      setRows(prev => (reset ? data : [...prev, ...data]));
      setHasMore(data.length === limit);
    } catch (e: any) {
      console.error(e);
      alert('Error cargando lista: ' + (e?.message ?? e));
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  // auto-apply de filtros (con debounce)
  useEffect(() => {
    const t = setTimeout(() => { setOffset(0); fetchPage(0, true); }, 350);
    return () => clearTimeout(t);
  }, [q, minQty, maxQty, onlyEnabled, hasCost]);

  // acciones por fila
  async function toggleEnabled(productId: number, enabled: boolean) {
    await fetch('/api/enabled', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, enabled })
    });
    setRows(prev => prev.map(r => r.product_id === productId ? { ...r, enabled } : r));
  }

  async function setUomFor(ppid: number, codigo: string) {
    await fetch('/api/uom-choice', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productPresentationId: ppid, codigo })
    });
    setRows(prev => prev.map(r => r.product_presentation_id === ppid ? { ...r, chosen_uom: codigo } : r));
  }

  return (
    <main className="p-4 max-w-7xl mx-auto space-y-3">
      <h1 className="text-2xl font-semibold">MGq Price Admin</h1>

      {/* Filtros (auto-apply) */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          className="border rounded px-3 py-2 w-64"
          placeholder="Buscar por nombre o ID"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <input
          className="border rounded px-2 py-2 w-28"
          placeholder="Pres ≥"
          value={minQty}
          onChange={e => setMinQty(e.target.value)}
        />
        <input
          className="border rounded px-2 py-2 w-28"
          placeholder="Pres ≤"
          value={maxQty}
          onChange={e => setMaxQty(e.target.value)}
        />
        <label className="px-2">
          <input
            type="checkbox"
            checked={onlyEnabled}
            onChange={e => setOnlyEnabled(e.target.checked)}
          />{' '}
          Solo activos
        </label>
        <label className="px-2">
          <input
            type="checkbox"
            checked={hasCost}
            onChange={e => setHasCost(e.target.checked)}
          />{' '}
          Con costo
        </label>
      </div>

      {/* Tabla */}
      <div className="overflow-auto rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-white text-black">
            <tr>
              <th className="p-2">Hab</th>
              <th className="p-2 text-left">Producto</th>
              <th className="p-2 text-center leading-tight">
                Prov<br />Pres
              </th>
              <th className="p-2 text-center leading-tight">
                Prov<br />UOM
              </th>
              <th className="p-2">Costo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.product_presentation_id} className="border-t">
                <td className="p-2 text-center">
                  <input
                    type="checkbox"
                    checked={!!r.enabled}
                    onChange={e => toggleEnabled(r.product_id, e.target.checked)}
                    title="Habilitar en la app"
                  />
                </td>
                <td className="p-2">{r.nombre}</td>
                <td className="p-2 text-center">{fmtInt(r.qty)}</td>
                <td className="p-2 text-center">
                  <select
                    className="border rounded px-2 py-1"
                    value={r.chosen_uom ?? ''}
                    onChange={e => { const v = e.target.value; if (v) setUomFor(r.product_presentation_id, v); }}
                  >
                    <option value="" disabled>Seleccione…</option>
                    {allowedUoms.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td className="p-2 text-right">{r.costo_ars ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginado */}
      <div className="py-3">
        <button
          className="px-4 py-2 rounded border disabled:opacity-50"
          disabled={loading || !hasMore}
          onClick={async () => { const next = offset + limit; setOffset(next); await fetchPage(next); }}
        >
          {loading ? 'Cargando…' : (hasMore ? 'Cargar más' : 'No hay más')}
        </button>
      </div>
    </main>
  );
}
