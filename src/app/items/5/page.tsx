import PriceHistoryChart from "../[item_id]/PriceHistoryChart";

export default function Item5Page() {
  return (
    <div style={{ padding: 16 }}>
      <h1>Ácido cítrico — Item 5</h1>
      <PriceHistoryChart itemId={5} days={60} />
    </div>
  );
}
