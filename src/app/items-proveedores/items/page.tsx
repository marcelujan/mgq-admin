import ItemsClient from "../../items/items-client";

export default function ItemsProveedoresItemsPage() {
  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Items Proveedor</h1>
      </div>

      <ItemsClient initialTipo="PROVEEDOR" lockTipo hideTipoFilter showSeleccionadoFilter />
    </div>
  );
}
