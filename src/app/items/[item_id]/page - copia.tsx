import PriceHistoryChart from "./PriceHistoryChart";
import OfferBulkForm from "./OfferBulkForm";

export default async function ItemPage({
  params,
}: {
  params: { item_id: string };
}) {
  const itemId = Number(params.item_id);

  if (!Number.isFinite(itemId) || itemId <= 0) {
    return (
      <div style={{ padding: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Item inválido</h1>
        <div style={{ opacity: 0.85 }}>item_id={String(params.item_id)}</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Item {itemId}</h1>

      <div style={{ fontSize: 14, opacity: 0.85 }}>
        Histórico diario por presentación (tabla:{" "}
        <code>app.item_price_daily_pres</code>)
      </div>

      <PriceHistoryChart itemId={itemId} />

      <hr style={{ opacity: 0.25 }} />

      <OfferBulkForm itemId={itemId} />
    </div>
  );
}
