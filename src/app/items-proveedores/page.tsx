"use client";

import { useState, type ReactNode } from "react";

import ItemsNewClient from "../items/new/items-new-client";
import JobsDiarioClient from "../jobs-diario/jobs-diario-client";
import ItemsClient from "../items/items-client";

function AccessCard({
  title,
  description,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 14,
        padding: 14,
        background: "rgba(255,255,255,0.02)",
        display: "grid",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</h2>
          <div style={{ fontSize: 12, opacity: 0.75 }}>{description}</div>
        </div>

        <button
          onClick={onToggle}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          {isOpen ? "Ocultar" : "Abrir"}
        </button>
      </div>

      {isOpen ? children : null}
    </div>
  );
}

export default function ItemsProveedoresPage() {
  const [showJobs, setShowJobs] = useState(false);
  const [showItems, setShowItems] = useState(false);

  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Items Proveedores</h1>
      </div>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 14,
          padding: 14,
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <ItemsNewClient forcedTab="PROVEEDOR" hideTabs backHref="/items-proveedores" />
      </div>

      <AccessCard
        title="Corrida diaria"
        description="Abrir cuando necesites revisar ejecuciones y resultados recientes."
        isOpen={showJobs}
        onToggle={() => setShowJobs((v) => !v)}
      >
        <JobsDiarioClient hideHeader />
      </AccessCard>

      <AccessCard
        title="Items Proveedor"
        description="Abrir cuando necesites consultar el listado completo de items proveedor."
        isOpen={showItems}
        onToggle={() => setShowItems((v) => !v)}
      >
        <ItemsClient initialTipo="PROVEEDOR" lockTipo hideTipoFilter />
      </AccessCard>
    </div>
  );
}
