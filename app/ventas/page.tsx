"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from 'next/link';

// --- Tipos aproximados de la vista enriquecida devuelta por /api/sales-items
// Ajustá los campos si tu SELECT cambia
export type SalesItem = {
  id: number;
  sku?: string;
  producto: string;
  vend_pres: number | null;
  vend_uom_id?: number | null;
  vend_uom?: string | null;
  dens_g_ml_override?: number | null;
  densidad_usada?: number | null; // "Dens [g/mL]"
  vend_costo_auto?: number | null;
  is_enabled: boolean;
};

// Debounce simple para inputs / búsqueda
function useDebounced<T>(value: T, ms = 500) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

async function fetchItems(params: {
  q?: string;
  enabled?: boolean | undefined;
  limit?: number;
  offset?: number;
}): Promise<{ items: SalesItem[]; limit: number; offset: number }> {
  const usp = new URLSearchParams();
  if (params.q) usp.set("q", params.q);
  if (typeof params.enabled === "boolean") usp.set("enabled", String(params.enabled));
  usp.set("limit", String(params.limit ?? 50));
  usp.set("offset", String(params.offset ?? 0));

  const res = await fetch(`/api/sales-items?${usp.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /api/sales-items ${res.status}`);
  return res.json();
}

async function patchItem(id: number, body: Partial<SalesItem>): Promise<SalesItem> {
  const res = await fetch(`/api/sales-items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH /api/sales-items/${id} ${res.status}`);
  const data = await res.json();
  return data.item as SalesItem;
}

export default function VentasPage() {
  const [q, setQ] = useState("");
  const qDebounced = useDebounced(q, 400);
  const [onlyEnabled, setOnlyEnabled] = useState<boolean>(true);
  const [page, setPage] = useState({ limit: 25, offset: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uoms, setUoms] = useState<string[]>([]);
  const [items, setItems] = useState<SalesItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/uoms', { cache: 'no-store' })
      .then(r => r.json())
      .then((codes) => { if (!cancelled) setUoms(Array.isArray(codes) ? codes : []); })
      .catch(() => { if (!cancelled) setUoms([]); });
    return () => { cancelled = true; };
  }, []);

  // cargar datos
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchItems({ q: qDebounced || undefined, enabled: onlyEnabled ? true : undefined, ...page })
      .then((d) => {
        if (!cancelled) setItems(d.items ?? []);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [qDebounced, onlyEnabled, page.limit, page.offset]);

  const onToggleEnabled = async (row: SalesItem, next: boolean) => {
    try {
      // Optimista
      setItems((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_enabled: next } : r)));
      const updated = await patchItem(row.id, { is_enabled: next });
      setItems((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
    } catch (e) {
      console.error(e);
      // revertir
      setItems((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_enabled: row.is_enabled } : r)));
      alert("Error guardando habilitado");
    }
  };

  const onChangeVendPres = async (row: SalesItem, next: number | "") => {

  const onChangeVendUom = async (row: SalesItem, next: string | "") => {
    const codigo = next === "" ? null : next;
    try {
      // optimista
      setItems((prev) => prev.map((r) => (r.id === row.id ? { ...r, vend_uom: codigo as any } : r)));
      // PATCH específico
      const res = await fetch('/api/uom-choice', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productPresentationId: row.id, codigo }),
      });
      if (!res.ok) throw new Error('PATCH /api/uom-choice failed');
      // opcional: re-fetch de página actual
      // (omito por ahora; dejamos el optimista)
    } catch (e) {
      console.error(e);
      alert('Error guardando UOM');
    }
  };

  const onChangeDensOverride = async (row: SalesItem, next: string) => {
    const val = next.trim() === '' ? null : Number(next);
    if (val !== null && !Number.isFinite(val)) return;
    try {
      // optimista
      setItems((prev) => prev.map((r) => (r.id === row.id ? { ...r, dens_g_ml_override: val as any } : r)));
      const updated = await patchItem(row.id, { dens_g_ml_override: val as any });
      setItems((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
    } catch (e) {
      console.error(e);
      alert('Error guardando densidad');
    }
  };
    const value = next === "" ? null : Number(next);
    if (value !== null && !Number.isFinite(value)) return; // ignorar
    try {
      setItems((prev) => prev.map((r) => (r.id === row.id ? { ...r, vend_pres: value as any } : r)));
      const updated = await patchItem(row.id, { vend_pres: value as any });
      setItems((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
    } catch (e) {
      console.error(e);
      alert("Error guardando presentación de venta");
    }
  };

  return (
    <div className="p-4 max-w-[1400px] mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Artículos de venta</h1>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por producto o SKU…"
          className="border rounded-md px-3 py-2 w-72 bg-transparent"
        />
        <label className="inline-flex items-center gap-2 select-none">
          <input
            type="checkbox"
            checked={onlyEnabled}
            onChange={(e) => setOnlyEnabled(e.target.checked)}
          />
          <span>Solo activos</span>
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setPage((p) => ({ ...p, offset: Math.max(0, p.offset - p.limit) }))}
            className="px-3 py-2 border rounded-md disabled:opacity-50"
            disabled={page.offset === 0 || loading}
          >
            ◀ Prev
          </button>
          <button
            onClick={() => setPage((p) => ({ ...p, offset: p.offset + p.limit }))}
            className="px-3 py-2 border rounded-md disabled:opacity-50"
            disabled={loading}
          >
            Next ▶
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-500 mb-3">Error: {error}</div>
      )}

      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-900/20">
            <tr>
              <th className="p-2 text-left w-24">Hab</th>
              <th className="p-2 text-left">Producto</th>
              <th className="p-2 text-right w-40">Vend Pres</th>
              <th className="p-2 text-left w-28">UOM</th>
              <th className="p-2 text-right w-36">Dens [g/mL]</th>
              <th className="p-2 text-right w-40">Vend Costo</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading && (
              <tr>
                <td className="p-3 text-center text-zinc-400" colSpan={6}>
                  Sin resultados
                </td>
              </tr>
            )}
            {items.map((r) => (
              <tr key={r.id} className="border-t hover:bg-zinc-900/10">
                <td className="p-2">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!r.is_enabled}
                      onChange={(e) => onToggleEnabled(r, e.target.checked)}
                    />
                    <span className="text-xs text-zinc-400">{r.is_enabled ? "Activo" : "Inactivo"}</span>
                  </label>
                </td>
                <td className="p-2 align-top">
                  <div className="font-medium leading-tight">{r.producto}</div>
                  {r.sku && (
                    <div className="text-[11px] text-zinc-500">SKU: {r.sku}</div>
                  )}
                </td>
                <td className="p-2 text-right">
                  <input
                    inputMode="decimal"
                    className="w-32 text-right border rounded-md px-2 py-1 bg-transparent"
                    value={r.vend_pres ?? ""}
                    onChange={(e) => onChangeVendPres(r, e.target.value as any)}
                  />
                </td>
                <td className="p-2 text-left">
                  <select
                    className="w-36 border rounded-md px-2 py-1 bg-transparent"
                    value={r.vend_uom ?? ""}
                    onChange={(e) => onChangeVendUom(r, e.target.value)}
                  >
                    <option value="">—</option>
                    {uoms.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </td>
                <td className="p-2 text-right">
                  <div>{r.densidad_usada ?? "-"}</div>
                  <input
                    type="number"
                    step="0.0001"
                    inputMode="decimal"
                    className="mt-1 w-24 text-right border rounded-md px-2 py-1 bg-transparent"
                    defaultValue={r.dens_g_ml_override ?? ""}
                    onBlur={(e) => onChangeDensOverride(r, e.currentTarget.value)}
                  />
                </td>
                <td className="p-2 text-right">
                  {r.vend_costo_auto != null ? r.vend_costo_auto.toFixed(2) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {loading && (
        <div className="mt-3 text-xs text-zinc-400">Cargando…</div>
      )}
    </div>
  );
}

<Link href="/ventas/nuevo" className="px-3 py-2 border rounded-md">+ Nuevo</Link>