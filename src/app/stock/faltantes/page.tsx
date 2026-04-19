import StockFaltantesClient from "../../_components/stock/stock-faltantes-client";

export default function StockFaltantesPage() {
  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Stock · Faltantes / Compras</h1>
      <StockFaltantesClient />
    </div>
  );
}
