import PublicacionesClient from "@/app/_components/vnext/publicaciones-client";

export default function PublicacionesPage() {
  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Publicaciones</h1>
      <PublicacionesClient />
    </div>
  );
}
