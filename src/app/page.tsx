import Link from "next/link";
import HomeUtcClock from "./_components/home-utc-clock";

const links = [
  { href: "/items", label: "Items" },
  { href: "/items-manuales", label: "Items Manuales" },
  { href: "/productos", label: "Items Formulados" },
  { href: "/items-proveedores", label: "Items Proveedores" },
  { href: "/dolar-historico", label: "Dólar Histórico" },
  { href: "/jobs", label: "Jobs manual" },
];

export default function Home() {
  return (
    <div
      style={{
        padding: 16,
        fontFamily: "system-ui, sans-serif",
        display: "grid",
        gap: 16,
      }}
    >
      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "1fr auto",
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontSize: 28, fontWeight: 700 }}>mgq-admin</div>
          <div style={{ fontSize: 13, opacity: 0.72 }}>
            Accesos principales de la app.
          </div>
        </div>
        <HomeUtcClock />
      </div>

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
