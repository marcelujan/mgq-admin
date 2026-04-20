"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import DbHealthIndicator from "./db-health-indicator";
import HomeUtcClock from "./home-utc-clock";

type Crumb = { href: string; label: string };

function labelForSegment(seg: string): string {
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
    case "items-comerciales":
      return "Items Comerciales";
    case "items-envases":
      return "Items Envases";
    case "items-etiqueta":
      return "Items Etiqueta";
    case "items-paqueteria":
      return "Items Paquetería";
    case "publicaciones":
      return "Canales de venta";
    case "stock":
      return "Stock";
    case "ingreso":
      return "Ingreso";
    case "ajuste":
      return "Ajuste";
    case "produccion":
      return "Producción";
    case "operaciones":
      return "Operaciones";
    case "movimientos":
      return "Movimientos";
    case "faltantes":
      return "Faltantes";
    case "new":
      return "Nuevo";
    case "dolar-historico":
      return "Dólar Histórico";
    default:
      return seg.replace(/-/g, " ");
  }
}

function buildCrumbs(pathname: string): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ href: "/", label: "Inicio" }];
  if (parts.length >= 1) crumbs.push({ href: `/${parts[0]}`, label: labelForSegment(parts[0]) });
  if (parts.length >= 2) crumbs.push({ href: pathname, label: labelForSegment(parts[1]) });
  return crumbs;
}

export default function AppHeader() {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const crumbs = useMemo(() => buildCrumbs(pathname), [pathname]);
  const showHomeClock = pathname === "/";

  function back() {
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
    { href: "/items-comerciales", label: "Items Comerciales" },
    { href: "/items-envases", label: "Items Envases" },
    { href: "/items-etiqueta", label: "Items Etiqueta" },
    { href: "/items-paqueteria", label: "Items Paquetería" },
    { href: "/publicaciones", label: "Canales de venta" },
    { href: "/stock", label: "Stock" },
    { href: "/dolar-historico", label: "Dólar Histórico" },
    { href: "/jobs", label: "Jobs manual" },
  ];

  return (
    <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.10)", background: "rgba(0,0,0,0.22)", display: "grid", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "start", gap: 12 }}>
        <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flexWrap: "wrap" }}>
            <button onClick={back} style={{ border: "none", background: "transparent", padding: 0, color: "inherit", cursor: "pointer", fontSize: 13, whiteSpace: "nowrap", opacity: 0.95 }} aria-label="Volver" title="Volver">
              ← Volver
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flexWrap: "wrap", lineHeight: 1.1 }}>
            {nav.map((n) => {
              const active = pathname === n.href;
              return (
                <Link key={n.href} href={n.href} style={{ textDecoration: active ? "underline" : "none", textUnderlineOffset: 3, color: "inherit", fontSize: 12.5, whiteSpace: "nowrap", opacity: active ? 1 : 0.88, fontWeight: active ? 700 : 400 }}>
                  {n.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, justifySelf: "end", whiteSpace: "nowrap", paddingTop: 2 }}>
          <DbHealthIndicator />
          <div style={{ fontSize: 12, opacity: 0.75 }}>mgq-admin</div>
        </div>
      </div>

      <div style={{ fontSize: 12, opacity: 0.7, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
          {crumbs.map((c, idx) => (
            <span key={c.href} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {idx > 0 ? <span style={{ opacity: 0.6 }}>/</span> : null}
              {idx === crumbs.length - 1 ? <span style={{ fontWeight: 600 }}>{c.label}</span> : <Link href={c.href} style={{ textDecoration: "none", color: "inherit" }}>{c.label}</Link>}
            </span>
          ))}
        </div>

        {showHomeClock ? <HomeUtcClock /> : <span />}
      </div>
    </div>
  );
}
