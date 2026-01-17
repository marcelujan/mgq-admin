"use client";

import { useEffect, useMemo, useState } from "react";

type ItemRow = {
  item_id: string | number;
  proveedor_codigo: string;
  proveedor_nombre: string;
  url_original: string;
  url_canonica: string;
  seleccionado: boolean;
  estado: string;
  created_at?: string;
  updated_at?: string;

  // si el GET pudo traer job:
  ultimo_job_id?: string | number | null;
  ultimo_job_estado?: string | null;
};

function qs(params: Record<string, any>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    sp.set(k, String(v));
  });
  return sp.toString();
}

export default function ItemsClient() {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("");
  const [seleccionado, setSeleccionado] = useState<"" | "true" | "false">("");
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  const query = useMemo(
    () =>
      qs({
        search: search.trim() || undefined,
        estado: estado || undefined,
        seleccionado: seleccionado || undefined,
        limit,
        offset,
      }),
    [search, estado, seleccionado, limit, offset]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetch(`/api/items?${query}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        return j.items as ItemRow[];
      })
      .then((rows) => {
        if (cancelled) return;
        setItems(rows);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message ?? "error");
        setItems([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex flex-col">
          <label className="text-xs opacity-70">Buscar</label>
          <input
            className="border rounded px-2 py-1 w-[280px]"
            value={search}
            onChange={(e) => {
              setOffset(0);
              setSearch(e.target.value);
            }}
            placeholder="url / proveedor..."
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs opacity-70">Estado (item)</label>
          <select
            className="border rounded px-2 py-1"
            value={estado}
            onChange={(e) => {
              setOffset(0);
              setEstado(e.target.value);
            }}
          >
            <option value="">(todos)</option>
            <option value="PENDING_SCRAPE">PENDING_SCRAPE</option>
            <option value="WAITING_REVIEW">WAITING_REVIEW</option>
            <option value="OK">OK</option>
            <option value="ERROR_SCRAPE">ERROR_SCRAPE</option>
            <option value="MANUAL_OVERRIDE">MANUAL_OVERRIDE</option>
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-xs opacity-70">Seleccionado</label>
          <select
            className="border rounded px-2 py-1"
            value={seleccionado}
            onChange={(e) => {
              setOffset(0);
              setSeleccionado(e.target.value as any);
            }}
          >
            <option value="">(todos)</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </div>

        <button
          className="border rounded px-3 py-1"
          onClick={() => {
            setSearch("");
            setEstado("");
            setSeleccionado("");
            setOffset(0);
          }}
        >
          Limpiar
        </button>

        <div className="ml-auto text-sm">
          {loading ? "Cargando..." : error ? <span className="text-red-600">{error}</span> : null}
        </div>
      </div>

      <div className="flex gap-2 items-center">
        <button
          className="border rounded px-3 py-1 disabled:opacity-50"
          disabled={offset === 0 || loading}
          onClick={() => setOffset((v) => Math.max(v - limit, 0))}
        >
          ← Prev
        </button>
        <button
          className="border rounded px-3 py-1 disabled:opacity-50"
          disabled={loading || items.length < limit}
          onClick={() => setOffset((v) => v + limit)}
        >
          Next →
        </button>
        <div className="text-xs opacity-70">offset={offset} limit={limit}</div>
      </div>

      <div className="border rounded overflow-auto">
        <table className="min-w-[1000px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left">
              <th className="p-2">item_id</th>
              <th className="p-2">proveedor</th>
              <th className="p-2">estado</th>
              <th className="p-2">seleccionado</th>
              <th className="p-2">url</th>
              <th className="p-2">último job</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={String(it.item_id)} className="border-t">
                <td className="p-2 whitespace-nowrap">{String(it.item_id)}</td>
                <td className="p-2 whitespace-nowrap">
                  <div className="font-medium">{it.proveedor_codigo}</div>
                  <div className="text-xs opacity-70">{it.proveedor_nombre}</div>
                </td>
                <td className="p-2 whitespace-nowrap">{it.estado}</td>
                <td className="p-2 whitespace-nowrap">{String(it.seleccionado)}</td>
                <td className="p-2">
                  <div className="truncate max-w-[520px]" title={it.url_original}>
                    {it.url_original}
                  </div>
                  <div className="text-xs opacity-60 truncate max-w-[520px]" title={it.url_canonica}>
                    {it.url_canonica}
                  </div>
                </td>
                <td className="p-2 whitespace-nowrap">
                  {it.ultimo_job_id ? (
                    <div>
                      <div className="font-medium">#{String(it.ultimo_job_id)}</div>
                      <div className="text-xs opacity-70">{it.ultimo_job_estado ?? ""}</div>
                    </div>
                  ) : (
                    <span className="text-xs opacity-50">(sin datos)</span>
                  )}
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 ? (
              <tr>
                <td className="p-4 text-sm opacity-70" colSpan={6}>
                  Sin resultados
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
