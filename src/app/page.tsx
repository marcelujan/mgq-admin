import Link from "next/link";

export default function Home() {
  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <ul style={{ lineHeight: 1.9 }}>
        <li>
          <Link href="/items">Items</Link>
        </li>
        <li>
          <Link href="/items-manuales">Items Manuales</Link>
        </li>
        <li>
          <Link href="/productos">Items Formulados</Link>
        </li>
        <li>
          <Link href="/items-proveedores">Items Proveedores</Link>
        </li>
        <li>
          <Link href="/dolar-historico">Dólar Histórico</Link>
        </li>
        <li>
          <Link href="/jobs">Jobs manual</Link>
        </li>
      </ul>
    </div>
  );
}
