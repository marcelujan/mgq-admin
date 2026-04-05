import JobsDiarioClient from "../../jobs-diario/jobs-diario-client";

export default function ItemsProveedoresCronPage() {
  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Cron</h1>
      </div>

      <JobsDiarioClient hideHeader />
    </div>
  );
}
