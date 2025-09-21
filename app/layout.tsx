import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "MGQ Admin" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-gray-100">{children}</body>
    </html>
  );
}
