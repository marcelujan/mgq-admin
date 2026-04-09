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

  return { date, time };
}

export default function HomeUtcClock() {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const { date, time } = useMemo(() => formatUtc(now), [now]);

  return (
    <div
      aria-label="Reloj UTC"
      title="Hora internacional (UTC)"
      style={{
        justifySelf: "end",
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 2,
        padding: "8px 10px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.03)",
        minWidth: 122,
      }}
    >
      <span style={{ fontSize: 11, opacity: 0.72, letterSpacing: 0.4 }}>UTC</span>
      <span style={{ fontSize: 12, opacity: 0.86 }}>{date}</span>
      <span style={{ fontSize: 14, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
        {time}
      </span>
    </div>
  );
}
