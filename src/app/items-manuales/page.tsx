import Link from "next/link";

import ManualesClient from "./manuales-client";

export default function ItemsManualesPage() {
  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            Items Manuales
          </h1>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Catálogo de costos manuales. Crear y editar aquí; el detalle
            histórico vive en Items.
          </div>
        </div>

        <Link
          href="/items-manuales/new"
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10,
            padding: "8px 10px",
            background: "rgba(255,255,255,0.03)",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          Nuevo item manual
        </Link>
      </div>

      <ManualesClient />
    </div>
  );
}
