import Link from "next/link";
import { ReactNode } from "react";

const tabs = [
  { href: "/proveedor", label: "Proveedor" },
  { href: "/compras", label: "Compras" },
  { href: "/productos", label: "Productos" },
  { href: "/ventas", label: "Ventas" },
];

export default function TabsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="p-4 md:p-8 space-y-6">
      <nav className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="px-4 py-2 rounded-2xl border bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {/* Eliminado el cuadrante/caja: dejamos el contenido tal cual */}
      <main>{children}</main>
    </div>
  );
}
