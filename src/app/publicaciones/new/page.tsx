import PublicacionForm from "@/app/_components/vnext/publicacion-form";

export default function NuevoCanalDeVentaPage() {
  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Nuevo canal de venta</h1>
      <PublicacionForm />
    </div>
  );
}
