// app/components/HomeTabs.tsx
"use client";
import { useState } from "react";
import ProveedorView from "./ProveedorView";
import VentasView from "./VentasView";

function ComprasView() {
  return <div className="p-4 text-sm opacity-80">Compras — (pendiente de definir)</div>;
}
function ProductosView() {
  return <div className="p-4 text-sm opacity-80">Productos — (pendiente de definir)</div>;
}

const TABS = ["Proveedor", "Compras", "Productos", "Ventas"] as const;
type Tab = typeof TABS[number];

export default function HomeTabs() {
  const [tab, setTab] = useState<Tab>("Proveedor");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-2xl border shadow-sm hover:shadow ${tab===t ? "bg-gray-100" : ""}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Proveedor" && <ProveedorView />}
      {tab === "Compras" && <ComprasView />}
      {tab === "Productos" && <ProductosView />}
      {tab === "Ventas" && <VentasView />}
    </div>
  );
}
