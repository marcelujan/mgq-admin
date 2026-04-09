"use client";

import { useEffect, useMemo, useState } from "react";

function formatUtc(now: Date) {
  const date = new Intl.DateTimeFormat("es-AR", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const time = new Intl.DateTimeFormat("es-AR", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);

  return `UTC · ${date} ${time}`;
}

export default function HomeUtcClock() {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const label = useMemo(() => formatUtc(now), [now]);

  return (
    <span
      aria-label="Reloj UTC"
      title="Hora internacional (UTC)"
      style={{
        fontSize: 12,
        opacity: 0.58,
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}
