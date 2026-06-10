import type { Metadata } from "next";
import { DM_Sans, DM_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["300", "400", "500", "600", "700"],
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  variable: "--font-dm-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "NexusOps — Universo Aventura",
  description: "Centro de control eCommerce",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-AR" className={`${dmSans.variable} ${dmMono.variable}`}>
      <body className="bg-[#040c05] text-gray-100 antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
// Build timestamp: Tue Jun  9 19:43:13     2026
