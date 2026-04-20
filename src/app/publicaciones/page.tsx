import PublicacionesClient from "@/app/_components/vnext/publicaciones-client";

export default function CanalesDeVentaPage() {
  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Canales de venta</h1>
      <PublicacionesClient />
    </div>
  );
}
