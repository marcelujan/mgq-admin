import StockSaldosClient from "../_components/stock/stock-saldos-client";

export default function StockPage() {
  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Stock</h1>
      <StockSaldosClient />
    </div>
  );
}
