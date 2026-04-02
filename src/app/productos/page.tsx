import Link from "next/link";

import ProductosClient from "./productos-client";

export default function ProductosPage() {
  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            Items Formulados
          </h1>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Catálogo de productos formulados.
          </div>
        </div>

        <Link
          href="/productos/new"
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10,
            padding: "8px 10px",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          Nuevo item formulado
        </Link>
      </div>

      <ProductosClient />
    </div>
  );
}
