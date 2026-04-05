import Link from "next/link";
import FxClient from "./fx-client";

export default function DolarHistoricoPage() {
  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Dólar Histórico</h1>
        <Link
          href="/dolar-historico/new"
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10,
            padding: "6px 10px",
            background: "rgba(255,255,255,0.03)",
            textDecoration: "none",
            color: "inherit",
            fontSize: 13,
            lineHeight: 1.15,
          }}
        >
          Nuevo
        </Link>
      </div>
      <FxClient />
    </div>
  );
}
