import { notFound } from "next/navigation";
import Link from "next/link";

async function fetchRow(id: string){
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/proveedor?id=${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export default async function Page({ params }: { params: { id: string }}){
  const row = await fetchRow(params.id);
  if (!row) return notFound();

  const fields = [
    "prov_articulo","prov_presentacion","prov_uom","prov_costo","prov_costoun","prov_act","prov_url","prov_descripcion","prov_densidad","prov_proveedor","prov_favoritos"
  ] as const;

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">Editar proveedor #{params.id}</h1>
        <Link href="/(tabs)/proveedor" className="text-sm underline">Volver</Link>
      </div>
      <form
        action="/api/proveedor/update"
        method="post"
        className="grid grid-cols-1 gap-3"
      >
        <input type="hidden" name="prov_id" value={params.id} />
        {fields.map((name)=> (
          <label key={name} className="grid gap-1">
            <span className="text-xs text-zinc-300">{name}</span>
            <input name={name} className="border border-zinc-700 bg-zinc-800 text-zinc-100 rounded px-2 py-1" defaultValue={(row && row[name]) ?? ""} />
          </label>
        ))}
        <div className="flex gap-2 mt-2">
          <button type="submit" className="px-3 py-1 rounded bg-blue-600">Guardar</button>
          <Link href="/(tabs)/proveedor" className="px-3 py-1 rounded bg-zinc-700">Cancelar</Link>
        </div>
      </form>
    </div>
  );
}
