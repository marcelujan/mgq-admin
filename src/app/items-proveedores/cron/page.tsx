import Link from "next/link";
import JobsDiarioClient from "../../jobs-diario/jobs-diario-client";

const headerLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.03)",
  fontSize: 13,
  lineHeight: 1.2,
  textDecoration: "none",
} as const;

export default function ItemsProveedoresCronPage() {
  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Cron</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/items-proveedores/cron" style={headerLinkStyle}>Cron</Link>
          <Link href="/items-proveedores/items" style={{ ...headerLinkStyle, opacity: 0.9 }}>Items</Link>
        </div>
      </div>

      <JobsDiarioClient hideHeader />
    </div>
  );
}
