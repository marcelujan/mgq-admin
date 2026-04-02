import Link from "next/link";

import ManualForm from "../../items/new/manual-form";

export default function ItemManualNewPage() {
  return (
    <div style={{ padding: 16, display: "grid", gap: 12, maxWidth: 720 }}>
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
            Nuevo Item Manual
          </h1>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Alta de costo manual para Items y fórmulas.
          </div>
        </div>

        <Link
          href="/items-manuales"
          style={{ textDecoration: "none", opacity: 0.85 }}
        >
          Volver
        </Link>
      </div>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: 12,
        }}
      >
        <ManualForm />
      </div>
    </div>
  );
}
