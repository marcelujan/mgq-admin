"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import DbHealthIndicator from "./db-health-indicator";

type Crumb = { href: string; label: string };

function labelForSegment(seg: string): string {
  // map only known top-level routes. Everything else is left as-is.
  switch (seg) {
    case "items":
      return "Items";
    case "productos":
      return "Items Formulados";
    case "jobs":
      return "Jobs manual";
    case "items-proveedores":
      return "Items Proveedores";
    case "items-manuales":
      return "Items Manuales";
    case "jobs-diario":
      return "Jobs diario";
    case "insumos":
      return "Insumos";    default:
      return seg.replace(/-/g, " ");
  }
}

function buildCrumbs(pathname: string): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ href: "/", label: "Inicio" }];

  // include at most: /{section}/{id-or-subpage}
  if (parts.length >= 1) {
    crumbs.push({ href: `/${parts[0]}`, label: labelForSegment(parts[0]) });
  }
  if (parts.length >= 2) {
    // do not treat ids as clickable crumbs (keeps behavior simple)
    crumbs.push({ href: pathname, label: labelForSegment(parts[1]) });
  }
  return crumbs;
}

export default function AppHeader() {
  const router = useRouter();
  const pathname = usePathname() || "/";

  const crumbs = useMemo(() => buildCrumbs(pathname), [pathname]);

  function back() {
    // Avoid leaving the app when user landed directly on a deep link.
    // If there is no prior history inside the session, go home.
    if (typeof window !== "undefined" && window.history.length <= 1) {
      router.push("/");
      return;
    }
    router.back();
  }

  const nav = [
    { href: "/items", label: "Items" },
    { href: "/items-manuales", label: "Items Manuales" },
    { href: "/productos", label: "Items Formulados" },
    { href: "/items-proveedores", label: "Items Proveedores" },
    { href: "/jobs", label: "Jobs manual" }
  ];

  return (
    <div
      style={{
        padding: "10px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(0,0,0,0.22)",
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={back}
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

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                style={{
                  padding: "6px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: pathname === n.href ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)",
                  textDecoration: "none",
                  color: "inherit",
                  fontSize: 13,
                }}
              >
                {n.label}
              </Link>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <DbHealthIndicator />
          <div style={{ fontSize: 12, opacity: 0.75 }}>mgq-admin</div>
        </div>
      </div>

      <div style={{ fontSize: 12, opacity: 0.7, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {crumbs.map((c, idx) => (
          <span key={c.href} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {idx > 0 ? <span style={{ opacity: 0.6 }}>/</span> : null}
            {idx === crumbs.length - 1 ? (
              <span style={{ fontWeight: 600 }}>{c.label}</span>
            ) : (
              <Link href={c.href} style={{ textDecoration: "none", color: "inherit" }}>
                {c.label}
              </Link>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}