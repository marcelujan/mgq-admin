import PublicacionForm from "@/app/_components/vnext/publicacion-form";

export default function NuevaPublicacionPage() {
  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Nueva Publicación</h1>
      <PublicacionForm />
    </div>
  );
}
