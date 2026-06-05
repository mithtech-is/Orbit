import type { JSX, ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { AppShell } from "./app-shell";
import "./globals.css";
import "./styles.css";

// IBM Plex is the app-wide UI font. The CSS variables are consumed by both the
// legacy styles.css (--font-sans) and the Tailwind/shadcn theme (font-sans).
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-sans",
  display: "swap"
});
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono",
  display: "swap"
});
const fontVars = `${ibmPlexSans.variable} ${ibmPlexMono.variable}`;

export const metadata: Metadata = {
  title: "Orbit",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/logo-64.png" }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2563eb"
};

// Default theme is always WHITE/light. We only switch to dark if the user
// explicitly chose it via the toggle (persisted in localStorage). OS preference
// is intentionally ignored so the default is a clean white app. Runs before paint
// to avoid a flash of the wrong theme.
const themeBootScript = `(function(){try{var t=localStorage.getItem('orbit_theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){}})();`;
// Register the PWA service worker (installable + offline shell).
const swRegisterScript = `(function(){if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}})();`;

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="en" className={fontVars}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <script dangerouslySetInnerHTML={{ __html: swRegisterScript }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
