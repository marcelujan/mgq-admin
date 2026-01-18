import Link from "next/link";

export default function Home() {
  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginTop: 0 }}>MGq Admin (v2)</h1>
      <ul style={{ lineHeight: 1.9 }}>
        <li>
          <Link href="/items">Items</Link>
        </li>
        <li>
          <Link href="/jobs">Jobs</Link>
        </li>
        <li>
          <Link href="/api/db-health" target="_blank">DB health</Link>
        </li>
      </ul>
    </div>
  );
}
