// =============================================
// app/ventas/components/SalesItemForm.tsx (V6)
// =============================================
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Fila que trae /api/price-list
export type PriceRow = {
  product_id: number | string;
  product_presentation_id: number | string;
  nombre: string;
  qty: number | string | null;
  chosen_uom?: string | null;       // UN | GR | ML
  prov_pres_fmt?: string | null;    // Texto ya formateado desde proveedor
};

export type SalesItem = {
  id: number;
  product_id: number;
  supplier_presentation_id: number | null;
  sku: string | null;
  vend_pres: number | null;
  vend_uom?: string | null;
  vend_lote?: string | null;
  vend_vence?: string | null;       // YYYY-MM-DD
  vend_grado?: string | null;
  vend_origen?: string | null;
  vend_obs?: string | null;
  vend_name?: string | null;        // <- tu API lo está pidiendo
  is_enabled: boolean;
};

type FormulaLine = {
  key: string;
  product_id: number | null;
  product_presentation_id: number | null;
  nombre?: string;
  qty?: number | null;
  uom?: string | null;
  mode: "pct" | "qty";
};

type Props = {
  mode: "create" | "edit";
  initial?: Partial<SalesItem> & { id?: number };
  onSaved?: (item: SalesItem) => void;
};

export default function SalesItemForm({ mode, initial, onSaved }: Props) {
  const router = useRouter();

  // Catálogo UOM
  const [uoms, setUoms] = useState<string[]>([]);
  useEffect(() => {
    let cancel = false;
    fetch("/api/uoms")
      .then((r) => r.json())
      .then((codes) => !cancel && setUoms(Array.isArray(codes) ? codes : []))
      .catch(() => !cancel && setUoms([]));
    return () => {
      cancel = true;
    };
  }, []);

  // Autocomplete (solo create)
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<PriceRow[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  useEffect(() => {
    if (mode !== "create") return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoadingOptions(true);
      try {
        const res = await fetch(
          `/api/price-list?q=${encodeURIComponent(q)}&show_all=1&limit=30`,
          { signal: ctl.signal, cache: "no-store" }
        );
        const data = (await res.json()) as PriceRow[];
        setOptions(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (e?.name !== "AbortError") console.error(e);
      } finally {
        setLoadingOptions(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, mode]);

  // Estado base
  const [productId, setProductId] = useState<number | null>(
    initial?.product_id ?? null
  );
  const [productPresentationId, setProductPresentationId] = useState<number | null>(
    (initial as any)?.product_presentation_id ??
      initial?.supplier_presentation_id ??
      null
  );
  const [nombreProducto, setNombreProducto] = useState<string>("");

  // Nombre de venta (independiente del proveedor).
  const [vendName, setVendName] = useState<string>(initial?.vend_name ?? "");

  const [sku, setSku] = useState<string>(initial?.sku ?? "");
  const [vendPres, setVendPres] = useState<string>(
    initial?.vend_pres != null ? String(initial.vend_pres) : ""
  );
  const [vendUom, setVendUom] = useState<string>(initial?.vend_uom ?? "");
  const [lote, setLote] = useState<string>(initial?.vend_lote ?? "");
  const [vence, setVence] = useState<string>(initial?.vend_vence ?? "");
  const [grado, setGrado] = useState<string>(initial?.vend_grado ?? "");
  const [origen, setOrigen] = useState<string>(initial?.vend_origen ?? "");
  const [obs, setObs] = useState<string>(initial?.vend_obs ?? "");
  const [enabled, setEnabled] = useState<boolean>(initial?.is_enabled ?? true);

  // Formulado
  const [isFormula, setIsFormula] = useState(false);
  const [lines, setLines] = useState<FormulaLine[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // -------- helpers --------
  function fmtQty(q: any) {
    if (q == null || q === "") return "";
    const n = Number(q);
    if (!Number.isFinite(n)) return String(q);
    if (Number.isInteger(n)) return String(n); // sin decimales si es entero
    let s = n.toFixed(3);
    if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
    return s;
  }

  // Normaliza cualquier forma común que pueda devolver tu endpoint de proveedor
  function normalizeProv(payload: any) {
    let o = payload;
    if (o && typeof o === "object") {
      if (o.prov_pres) o = o.prov_pres;
      else if (o.item) o = o.item;
      else if (Array.isArray(o) && o.length) o = o[0];
    }
    return {
      lote: o?.lote ?? o?.vend_lote ?? o?.etiqueta_auto_lote ?? "",
      vence: o?.vence ?? o?.vend_vence ?? o?.etiqueta_auto_vence ?? "",
      grado: o?.grado ?? o?.vend_grado ?? o?.etiqueta_auto_grado ?? "",
      origen: o?.origen ?? o?.vend_origen ?? o?.etiqueta_auto_origen ?? "",
      obs: o?.obs ?? o?.vend_obs ?? o?.etiqueta_auto_obs ?? "",
      vend_uom: o?.vend_uom ?? o?.uom ?? o?.chosen_uom ?? null,
      vend_pres: o?.vend_pres ?? o?.qty ?? null,
    };
  }

  // Trae datos del proveedor para precarga
  async function fetchProvPreset(presId: number) {
    const urls = [
      `/api/presentation?id=${presId}`,
      `/api/presentation/${presId}`,
      `/api/presentation?presentationId=${presId}`,
      `/api/sales-items/${presId}/prov-pres`, // fallback
    ];
    for (const u of urls) {
      try {
        const r = await fetch(u, { cache: "no-store" });
        if (!r.ok) continue;
        const j = await r.json();
        return normalizeProv(j);
      } catch {
        // probar siguiente URL
      }
    }
    return null;
  }

  // Al elegir una opción del buscador
  async function chooseOption(p: PriceRow) {
    const pid = Number(p.product_id);
    const presId = Number(p.product_presentation_id);

    setProductId(Number.isFinite(pid) ? pid : null);
    setProductPresentationId(Number.isFinite(presId) ? presId : null);
    setNombreProducto(p.nombre);

    // sugerencia de nombre (editable)
    const sugg = [p.nombre, "–", fmtQty(p.qty), p.chosen_uom ?? ""]
      .filter(Boolean)
      .join(" ");
    setVendName(sugg.trim());

    // sugerencia de presentación y uom
    setVendPres(p.qty != null ? String(p.qty) : "");
    setVendUom(p.chosen_uom ?? "");

    // Precarga desde proveedor
    const prov = await fetchProvPreset(presId);
    if (prov && typeof prov === "object") {
      setLote(prov.lote ?? "");
      setVence(prov.vence ?? "");
      setGrado(prov.grado ?? "");
      setOrigen(prov.origen ?? "");
      setObs(prov.obs ?? "");
      if (prov.vend_uom) setVendUom(prov.vend_uom);
      if (prov.vend_pres != null) setVendPres(String(prov.vend_pres));
    }
  }

  // -------- formulado --------
  function addLine() {
    setLines((xs) => [
      ...xs,
      {
        key: crypto.randomUUID(),
        product_id: null,
        product_presentation_id: null,
        mode: "pct",
      },
    ]);
  }
  function removeLine(key: string) {
    setLines((xs) => xs.filter((l) => l.key !== key));
  }
  function updateLine(key: string, patch: Partial<FormulaLine>) {
    setLines((xs) => xs.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  // -------- submit --------
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (mode === "create") {
        const pid = Number(productId);
        const presId = Number(productPresentationId);
        if (!Number.isFinite(pid) || !Number.isFinite(presId)) {
          throw new Error("Elegí un producto/presentación");
        }

        const body: any = {
          product_id: pid,                                   // <-- number
          supplier_presentation_id: presId,                  // <-- number
          sku: sku?.trim() || null,
          vend_pres: vendPres?.trim() === "" ? null : Number(vendPres),
          vend_lote: lote?.trim() || null,
          vend_vence: vence?.trim() || null,
          vend_grado: grado?.trim() || null,
          vend_origen: origen?.trim() || null,
          vend_obs: obs?.trim() || null,
          vend_name: vendName?.trim() || null,               // <-- requerido por tu API
          is_enabled: !!enabled,
          is_formula: isFormula || undefined,
          formula: isFormula
            ? lines.map((l) => ({
                product_id: l.product_id,
                product_presentation_id: l.product_presentation_id,
                qty: l.qty ?? null,
                uom: l.uom ?? null,
                mode: l.mode,
              }))
            : undefined,
        };

        const res = await fetch("/api/sales-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          let msg = `POST /api/sales-items → ${res.status}`;
          try {
            const j = await res.json();
            if (j?.error) msg += `: ${JSON.stringify(j.error)}`;
          } catch {}
          throw new Error(msg);
        }

        const { item } = (await res.json()) as { item: SalesItem };

        // UOM se persiste aparte contra la presentación
        if (vendUom && presId) {
          await fetch("/api/uom-choice", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productPresentationId: presId, codigo: vendUom }),
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
        vend_lote: lote?.trim() || null,
        vend_vence: vence?.trim() || null,
        vend_grado: grado?.trim() || null,
        vend_origen: origen?.trim() || null,
        vend_obs: obs?.trim() || null,
        vend_name: vendName?.trim() || null,
        is_enabled: !!enabled,
      };

      const r = await fetch(`/api/sales-items/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      if (!r.ok) {
        let msg = `PATCH /api/sales-items/${initial.id} → ${r.status}`;
        try {
          const j = await r.json();
          if (j?.error) msg += `: ${JSON.stringify(j.error)}`;
        } catch {}
        throw new Error(msg);
      }

      const data = (await r.json()) as { item: SalesItem };

      if (vendUom && (initial as any)?.supplier_presentation_id) {
        await fetch("/api/uom-choice", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productPresentationId: (initial as any).supplier_presentation_id,
            codigo: vendUom,
          }),
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

  // -------- UI auxiliar --------
  function OptionRow({ p, onClick }: { p: PriceRow; onClick: () => void }) {
    const provTxt =
      p.prov_pres_fmt ?? [fmtQty(p.qty), p.chosen_uom ?? ""].filter(Boolean).join(" ");
    return (
      <button type="button" onClick={onClick} className="w-full text-left p-2 hover:bg-zinc-900/10">
        <div className="text-sm font-medium truncate">{p.nombre}</div>
        <pre className="text-[11px] text-zinc-500 whitespace-pre-wrap leading-tight">
          {"Prov Pres  │ " + provTxt}
        </pre>
        <div className="text-[10px] text-zinc-500">
          {"prod " + p.product_id + " · pres " + p.product_presentation_id}
        </div>
      </button>
    );
  }

  // -------- render --------
  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-4">
      {mode === "create" && (
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
              <OptionRow
                key={`${p.product_id}-${p.product_presentation_id}`}
                p={p}
                onClick={() => chooseOption(p)}
              />
            ))}
          </div>
          {productPresentationId && (
            <div className="text-xs text-zinc-500">
              Seleccionado: {nombreProducto} (prod {productId} / pres {productPresentationId})
            </div>
          )}
        </div>
      )}

      {/* Nombre de venta independiente */}
      <div>
        <label className="block text-sm font-medium">Nombre de venta</label>
        <input
          className="w-full border rounded-md px-3 py-2 bg-transparent"
          placeholder="Ej.: Alcohol Cetílico 1 kg (grado cosmético)"
          value={vendName}
          onChange={(e) => setVendName(e.target.value)}
        />
        <div className="text-[11px] text-zinc-500 mt-1">
          Este es el nombre que verá el cliente. Podés partir del sugerido y editarlo.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">SKU</label>
          <input
            className="w-full border rounded-md px-3 py-2 bg-transparent"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Habilitado</label>
          <label className="inline-flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
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
          <select
            className="w-full border rounded-md px-3 py-2 bg-transparent"
            value={vendUom}
            onChange={(e) => setVendUom(e.target.value)}
          >
            <option value="">—</option>
            {uoms.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Densidad: no se pide aquí (se hereda) */}
        <div>
          <label className="block text-sm font-medium">Lote</label>
          <input
            className="w-full border rounded-md px-3 py-2 bg-transparent"
            value={lote}
            onChange={(e) => setLote(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Vence</label>
          <input
            type="date"
            className="w-full border rounded-md px-3 py-2 bg-transparent"
            value={vence}
            onChange={(e) => setVence(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Grado</label>
          <input
            className="w-full border rounded-md px-3 py-2 bg-transparent"
            value={grado}
            onChange={(e) => setGrado(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Origen</label>
          <input
            className="w-full border rounded-md px-3 py-2 bg-transparent"
            value={origen}
            onChange={(e) => setOrigen(e.target.value)}
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium">Observaciones</label>
          <textarea
            className="w-full border rounded-md px-3 py-2 bg-transparent"
            rows={3}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
          />
        </div>
      </div>

      {/* Formulado */}
      <div className="border rounded-lg p-3 space-y-3">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={isFormula}
            onChange={(e) => setIsFormula(e.target.checked)}
          />
          <span className="font-medium">Es un producto formulado</span>
        </label>
        {isFormula && (
          <div className="space-y-2">
            <div className="text-xs text-zinc-400">
              Cargá componentes (en % o cantidades). Las densidades se heredan del proveedor.
            </div>
            {lines.map((l) => (
              <div
                key={l.key}
                className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center"
              >
                <div className="md:col-span-5">
                  <input
                    placeholder="Buscar componente… (elegilo arriba y asignalo aquí)"
                    className="w-full border rounded-md px-3 py-2 bg-transparent"
                    onFocus={() => setQ("")}
                    onChange={() => {}}
                  />
                  {l.nombre && (
                    <div className="text-[11px] text-zinc-500 truncate">{l.nombre}</div>
                  )}
                </div>
                <div className="md:col-span-2">
                  <select
                    className="w-full border rounded-md px-2 py-2 bg-transparent"
                    value={l.mode}
                    onChange={(e) => updateLine(l.key, { mode: e.target.value as any })}
                  >
                    <option value="pct">%</option>
                    <option value="qty">Cant.</option>
                  </select>
                </div>
                <div className="md:col-span-3">
                  <input
                    inputMode="decimal"
                    placeholder={l.mode === "pct" ? "%" : "Cantidad"}
                    className="w-full border rounded-md px-3 py-2 bg-transparent text-right"
                    value={l.qty ?? ""}
                    onChange={(e) =>
                      updateLine(l.key, {
                        qty: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <select
                    className="w-full border rounded-md px-2 py-2 bg-transparent"
                    value={l.uom ?? ""}
                    onChange={(e) => updateLine(l.key, { uom: e.target.value || null })}
                  >
                    <option value="">—</option>
                    {uoms.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-12">
                  <button
                    type="button"
                    className="text-xs text-red-500"
                    onClick={() => removeLine(l.key)}
                  >
                    Quitar
                  </button>
                </div>
              </div>
            ))}
            <button type="button" className="px-3 py-2 border rounded-md" onClick={addLine}>
              + Agregar componente
            </button>
          </div>
        )}
      </div>

      {error && <div className="text-sm text-red-500">{error}</div>}

      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={saving} className="px-4 py-2 border rounded-md">
          {saving ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          disabled={saving}
          className="px-4 py-2 border rounded-md"
          onClick={() => router.back()}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
