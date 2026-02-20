"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";

type NavItem = { href: string; label: string };

const NAV: NavItem[] = [
  { href: "/", label: "Inicio" },
  { href: "/productos", label: "Productos" },
  { href: "/items", label: "Items" },
  { href: "/jobs", label: "Jobs manual" },
  { href: "/jobs-diario", label: "Jobs diario" },
  { href: "/insumos", label: "Insumos" },
];

const LABELS: Record<string, string> = {
  productos: "Productos",
  items: "Items",
  jobs: "Jobs manual",
  "jobs-diario": "Jobs diario",
  insumos: "Insumos",
  new: "Nuevo",
};

function buildBreadcrumb(pathname: string): { href: string; label: string }[] {
  const clean = (pathname || "/").split("?")[0].split("#")[0];
  const parts = clean.split("/").filter(Boolean);

  // "/" => "Inicio"
  if (parts.length === 0) return [{ href: "/", label: "Inicio" }];

  const crumbs: { href: string; label: string }[] = [{ href: "/", label: "Inicio" }];
  let acc = "";
  for (const p of parts) {
    acc += `/${p}`;
    crumbs.push({ href: acc, label: LABELS[p] ?? p });
  }
  return crumbs;
}

export default function AppHeader() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";

  const crumbs = useMemo(() => buildBreadcrumb(pathname), [pathname]);

  const onBack = () => {
    // En navegación directa (sin history), router.back() puede salir del sitio.
    // Fallback seguro a Inicio.
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  };

  return (
    <div
      style={{
        borderBottom: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(0,0,0,0.15)",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "10px 16px", display: "grid", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 10,
              padding: "6px 10px",
              background: "rgba(255,255,255,0.03)",
              cursor: "pointer",
            }}
            aria-label="Volver"
            title="Volver"
          >
            ← Volver
          </button>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                style={{
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 10,
                  padding: "6px 10px",
                  background: n.href !== "/" && pathname.startsWith(n.href) ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
                  textDecoration: "none",
                }}
              >
                {n.label}
              </Link>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 12, opacity: 0.8, display: "flex", gap: 6, flexWrap: "wrap" }}>
          {crumbs.map((c, idx) => (
            <span key={c.href} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {idx > 0 ? <span style={{ opacity: 0.6 }}>/</span> : null}
              <Link href={c.href} style={{ textDecoration: "none" }}>
                {c.label}
              </Link>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
