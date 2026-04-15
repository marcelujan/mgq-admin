import Link from "next/link";

const links = [
  { href: "/items", label: "Items" },
  { href: "/items-manuales", label: "Items Manuales" },
  { href: "/productos", label: "Items Formulados" },
  { href: "/items-proveedores", label: "Items Proveedores" },
  { href: "/items-comerciales", label: "Items Comerciales" },
  { href: "/items-envases", label: "Items Envases" },
  { href: "/items-etiqueta", label: "Items Etiqueta" },
  { href: "/items-paqueteria", label: "Items Paquetería" },
  { href: "/dolar-historico", label: "Dólar Histórico" },
  { href: "/jobs", label: "Jobs manual" },
];

export default function Home() {
  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <ul style={{ lineHeight: 1.9, margin: 0, paddingLeft: 18 }}>
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href}>{link.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
