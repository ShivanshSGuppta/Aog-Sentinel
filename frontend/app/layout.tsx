import type { Metadata } from "next";
import { IBM_Plex_Sans, Space_Grotesk } from "next/font/google";

import { AppShell } from "@/components/app-shell";
import { AuthProvider } from "@/components/auth-provider";
import { WorkspaceProvider } from "@/components/workspace-provider";

import "cesium/Build/Cesium/Widgets/widgets.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-plex",
  weight: ["400", "500", "600", "700"],
});

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "AOG Sentinel",
  description: "Aircraft fleet reliability and maintenance intelligence platform.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <AuthProvider>
          <WorkspaceProvider>
            <AppShell>{children}</AppShell>
          </WorkspaceProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
