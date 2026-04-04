"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, loading } = useAuth();
  const isImmersiveFlightsRoute = pathname.startsWith("/flights");
  const isLoginRoute = pathname === "/login";

  if (isLoginRoute) {
    return <div className="min-h-screen bg-radar text-ink-900">{children}</div>;
  }

  if (loading && !isAuthenticated) {
    return <div className="min-h-screen bg-radar text-ink-900" />;
  }

  if (isImmersiveFlightsRoute) {
    return <div className="min-h-screen bg-[#06080B] text-white">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-radar text-ink-900">
      <Sidebar />
      <div className="lg:pl-72">
        <Topbar />
        <main className="mx-auto max-w-[1600px] px-4 pb-10 pt-6 sm:px-6 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
