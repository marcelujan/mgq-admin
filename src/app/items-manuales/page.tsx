import ItemsNewClient from "../items/new/items-new-client";
import ManualesClient from "./manuales-client";

export default function ItemsManualesPage() {
  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Items Manuales</h1>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Catálogo de costos manuales (cost_option tipo MANUAL_PRESENTACION). Crear/editar aquí; el detalle de precios vive en Items (gráficos).
        </div>
      </div>

      <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, padding: 14, background: "rgba(255,255,255,0.02)" }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, marginBottom: 10 }}>Crear manual</h2>
        <ItemsNewClient forcedTab="MANUAL" hideTabs backHref="/items-manuales" />
      </div>

      <ManualesClient />
    </div>
  );
}
