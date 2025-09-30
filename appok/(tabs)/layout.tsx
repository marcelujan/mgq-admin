'use client';
import Link from "next/link";
import { ReactNode } from "react";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/proveedor", label: "Proveedor" },
  { href: "/compras", label: "Compras" },
  { href: "/productos", label: "Productos" },
  { href: "/ventas", label: "Ventas" },
];

export default function TabsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="p-4 md:p-8 space-y-6">
      <nav className="flex gap-2 flex-wrap">
        {tabs.map((t) => {
          const active = pathname?.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={[
                "px-4 py-2 rounded-2xl border border-zinc-700",
                active ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700",
              ].join(" ")}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <main>{children}</main>
    </div>
  );
}
