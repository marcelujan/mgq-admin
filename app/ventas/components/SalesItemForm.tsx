"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// Tipos aproximados basados en tus endpoints existentes
export type PriceRow = {
  product_id: number;
  product_presentation_id: number;
  nombre: string;
  qty: number | null;
  chosen_uom?: string | null; // UN | GR | ML
};

export type SalesItem = {
  id: number; // id del sales_item
  product_id: number;
  supplier_presentation_id: number | null;
  sku: string | null;
  vend_pres: number | null;
  vend_uom?: string | null;
  dens_g_ml_override?: number | null;
  vend_lote?: string | null;
  vend_vence?: string | null; // YYYY-MM-DD
  vend_grado?: string | null;
  vend_origen?: string | null;
  vend_obs?: string | null;
  vend_url?: string | null;
  is_enabled: boolean;
};

export type SalesItemFormProps = {
  mode: "create" | "edit";
  initial?: Partial<SalesItem> & { id?: number };
  onSaved?: (item: SalesItem) => void;
};

export default function SalesItemForm({ mode, initial, onSaved }: SalesItemFormProps) {
  const router = useRouter();

  // Catálogos
  const [uoms, setUoms] = useState<string[]>([]);

  // Buscador de producto/presentación (solo create)
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<PriceRow[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Estado del formulario
  const [productId, setProductId] = useState<number | null>(initial?.product_id ?? null);
  const [productPresentationId, setProductPresentationId] = useState<number | null>(
    (initial as any)?.product_presentation_id ?? initial?.supplier_presentation_id ?? null
  );
  const [nombreProducto, setNombreProducto] = useState<string>("");

  const [sku, setSku] = useState<string>(initial?.sku ?? "");
  const [vendPres, setVendPres] = useState<string>(
    initial?.vend_pres != null ? String(initial.vend_pres) : ""
  );
  const [vendUom, setVendUom] = useState<string>(initial?.vend_uom ?? "");
  const [dens, setDens] = useState<string>(
    initial?.dens_g_ml_override != null ? String(initial.dens_g_ml_override) : ""
  );
  const [lote, setLote] = useState<string>(initial?.vend_lote ?? "");
  const [vence, setVence] = useState<string>(initial?.vend_vence ?? "");
  const [grado, setGrado] = useState<string>(initial?.vend_grado ?? "");
  const [origen, setOrigen] = useState<string>(initial?.vend_origen ?? "");
  const [obs, setObs] = useState<string>(initial?.vend_obs ?? "");
  const [url, setUrl] = useState<string>(initial?.vend_url ?? "");
  const [enabled, setEnabled] = useState<boolean>(initial?.is_enabled ?? true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/uoms")
      .then((r) => r.json())
      .then((codes) => {
        if (!cancelled) setUoms(Array.isArray(codes) ? codes : []);
      })
      .catch(() => !cancelled && setUoms([]));
    return () => {
      cancelled = true;
    };
  }, []);

  // Buscar productos/presentaciones (solo en create)
  useEffect(() => {
    if (mode !== "create") return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoadingOptions(true);
      try {
        const res = await fetch(`/api/price-list?q=${encodeURIComponent(q)}&show_all=1&limit=30`, {
          signal: ctl.signal,
          cache: "no-store",
        });
        const data = (await res.json()) as PriceRow[];
        setOptions(Array.isArray(data) ? data : []);
      } catch (e) {
        if ((e as any)?.name !== "AbortError") console.error(e);
      } finally {
        setLoadingOptions(false);
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, mode]);

  // Elegir una opción autocompleta
  function chooseOption(p: PriceRow) {
    setProductId(p.product_id);
    setProductPresentationId(p.product_presentation_id);
    setNombreProducto(p.nombre);
    setVendPres(p.qty != null ? String(p.qty) : "");
    setVendUom(p.chosen_uom ?? "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (mode === "create") {
        if (!productId || !productPresentationId) {
          throw new Error("Elegí un producto/presentación");
        }
        // Crear sales_item mínimo
        const body: any = {
          product_id: productId,
          supplier_presentation_id: productPresentationId,
          sku: sku?.trim() || null,
          vend_pres: vendPres?.trim() === "" ? null : Number(vendPres),
          dens_g_ml_override: dens?.trim() === "" ? null : Number(dens),
          vend_lote: lote?.trim() || null,
          vend_vence: vence?.trim() || null,
          vend_grado: grado?.trim() || null,
          vend_origen: origen?.trim() || null,
          vend_obs: obs?.trim() || null,
          vend_url: url?.trim() || null,
          is_enabled: !!enabled,
        };
        const res = await fetch("/api/sales-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`POST /api/sales-items → ${res.status}`);
        const { item } = (await res.json()) as { item: SalesItem };

        // Si el usuario eligió UOM, aplicarla a la presentación (usa endpoint existente)
        if (vendUom && productPresentationId) {
          await fetch("/api/uom-choice", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productPresentationId: productPresentationId, codigo: vendUom }),
          }).catch(console.error);
        }

        onSaved?.(item);
        router.push("/ventas");
        return;
      }

      // EDIT
      if (!initial?.id) throw new Error("Falta id para editar");
      const patch: any = {
        sku: sku?.trim() || null,
        vend_pres: vendPres?.trim() === "" ? null : Number(vendPres),
        dens_g_ml_override: dens?.trim() === "" ? null : Number(dens),
        vend_lote: lote?.trim() || null,
        vend_vence: vence?.trim() || null,
        vend_grado: grado?.trim() || null,
        vend_origen: origen?.trim() || null,
        vend_obs: obs?.trim() || null,
        vend_url: url?.trim() || null,
        is_enabled: !!enabled,
      };
      const r = await fetch(`/api/sales-items/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error(`PATCH /api/sales-items/${initial.id} → ${r.status}`);
      const data = (await r.json()) as { item: SalesItem };

      // UOM (si la cambió en edición) → aplicar a la presentación
      if (vendUom && initial?.supplier_presentation_id) {
        await fetch("/api/uom-choice", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productPresentationId: initial.supplier_presentation_id, codigo: vendUom }),
        }).catch(console.error);
      }

      onSaved?.(data.item);
      router.push("/ventas");
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-4">
      {mode === "create" ? (
        <div className="space-y-2">
          <label className="block text-sm font-medium">Producto / presentación</label>
          <input
            className="w-full border rounded-md px-3 py-2 bg-transparent"
            placeholder="Buscar por nombre o ID…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="border rounded-md divide-y max-h-72 overflow-auto">
            {loadingOptions && <div className="p-2 text-sm text-zinc-500">Buscando…</div>}
            {!loadingOptions && options.length === 0 && (
              <div className="p-2 text-sm text-zinc-500">Sin resultados</div>
            )}
            {options.map((p) => (
              <button
                type="button"
                key={`${p.product_id}-${p.product_presentation_id}`}
                onClick={() => chooseOption(p)}
                className="w-full text-left p-2 hover:bg-zinc-900/10"
              >
                <div className="text-sm font-medium">{p.nombre}</div>
                <div className="text-xs text-zinc-500">
                  Pres: {p.qty ?? "-"} · UOM: {p.chosen_uom ?? "-"} · prod {p.product_id} · pres {p.product_presentation_id}
                </div>
              </button>
            ))}
          </div>
          {productPresentationId && (
            <div className="text-xs text-zinc-500">
              Seleccionado: {nombreProducto} (prod {productId} / pres {productPresentationId})
            </div>
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">SKU</label>
          <input className="w-full border rounded-md px-3 py-2 bg-transparent" value={sku} onChange={(e) => setSku(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Habilitado</label>
          <label className="inline-flex items-center gap-2 mt-2">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span className="text-sm">Activo</span>
          </label>
        </div>
        <div>
          <label className="block text-sm font-medium">Presentación de venta</label>
          <input
            className="w-full border rounded-md px-3 py-2 bg-transparent"
            inputMode="decimal"
            value={vendPres}
            onChange={(e) => setVendPres(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">UOM de venta</label>
          <select className="w-full border rounded-md px-3 py-2 bg-transparent" value={vendUom} onChange={(e) => setVendUom(e.target.value)}>
            <option value="">—</option>
            {uoms.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Densidad [g/mL] (override)</label>
          <input className="w-full border rounded-md px-3 py-2 bg-transparent" inputMode="decimal" value={dens} onChange={(e) => setDens(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Lote</label>
          <input className="w-full border rounded-md px-3 py-2 bg-transparent" value={lote} onChange={(e) => setLote(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Vence</label>
          <input type="date" className="w-full border rounded-md px-3 py-2 bg-transparent" value={vence} onChange={(e) => setVence(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Grado</label>
          <input className="w-full border rounded-md px-3 py-2 bg-transparent" value={grado} onChange={(e) => setGrado(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium">Origen</label>
          <input className="w-full border rounded-md px-3 py-2 bg-transparent" value={origen} onChange={(e) => setOrigen(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium">Observaciones</label>
          <textarea className="w-full border rounded-md px-3 py-2 bg-transparent" rows={3} value={obs} onChange={(e) => setObs(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium">URL (ficha técnica / proveedor)</label>
          <input className="w-full border rounded-md px-3 py-2 bg-transparent" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
      </div>

      {error && <div className="text-sm text-red-500">{error}</div>}

      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={saving} className="px-4 py-2 border rounded-md">
          {saving ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" disabled={saving} className="px-4 py-2 border rounded-md" onClick={() => router.back()}>
          Cancelar
        </button>
      </div>
    </form>
  );
}