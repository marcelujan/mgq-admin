import FxForm from "../fx-form";

export default function DolarHistoricoNewPage() {
  return (
    <div style={{ padding: 16, display: "grid", gap: 14 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Nuevo</h1>
      <FxForm mode="new" />
    </div>
  );
}
