import ItemsNewClient from "../items/new/items-new-client";
import JobsDiarioClient from "../jobs-diario/jobs-diario-client";
import ItemsClient from "../items/items-client";

export default function ItemsProveedoresPage() {
  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          Items Proveedores
        </h1>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Alta por URLs y seguimiento de la corrida diaria. El detalle histórico
          de precios vive en Items.
        </div>
      </div>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 14,
          padding: 14,
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <h2
          style={{ fontSize: 16, fontWeight: 700, margin: 0, marginBottom: 10 }}
        >
          Cargar URLs
        </h2>
        <ItemsNewClient
          forcedTab="PROVEEDOR"
          hideTabs
          backHref="/items-proveedores"
        />
      </div>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 14,
          padding: 14,
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <h2
          style={{ fontSize: 16, fontWeight: 700, margin: 0, marginBottom: 10 }}
        >
          Corrida diaria
        </h2>
        <JobsDiarioClient hideHeader />
      </div>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 14,
          padding: 14,
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <h2
          style={{ fontSize: 16, fontWeight: 700, margin: 0, marginBottom: 10 }}
        >
          Listado de items proveedor
        </h2>
        <ItemsClient initialTipo="PROVEEDOR" lockTipo hideTipoFilter />
      </div>
    </div>
  );
}
