import Link from "next/link";
import InsumosClient from "./insumos-client";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>Insumos</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Catálogo interno de componentes y fuentes de costo.</div>
        </div>
        <Link
          href="/productos"
          style={{ padding: "8px 10px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
        >
          Volver
        </Link>
      </div>

      <InsumosClient />
    </main>
  );
}
