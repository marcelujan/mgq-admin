import PublicacionForm from "@/app/_components/vnext/publicacion-form";

type Props = { params: Promise<{ publicacion_id: string }> };

export default async function EditarCanalDeVentaPage({ params }: Props) {
  const { publicacion_id } = await params;
  const id = Number(publicacion_id);

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Editar canal de venta</h1>
      <PublicacionForm publicacionId={id} />
    </div>
  );
}
