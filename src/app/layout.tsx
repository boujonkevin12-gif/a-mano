import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: { default: "A Mano | Encontrá servicios cerca tuyo", template: "%s | A Mano" },
  description: "Descubrí profesionales y servicios en Concepción del Uruguay. Conocé sus trabajos y contactalos directamente.",
  openGraph: { title: "A Mano | Encontrá lo que necesitás. Cerca tuyo.", description: "Servicios locales en Concepción del Uruguay, Entre Ríos.", locale: "es_AR", type: "website" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1f4b3c",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es-AR"><body><Header />{children}<Footer /></body></html>;
}
