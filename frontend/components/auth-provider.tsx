"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { api } from "@/lib/api";
import { clearStoredSession, getStoredSession, setStoredSession } from "@/lib/auth-store";
import type { AuthUser, SessionInfo } from "@/lib/types";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshUser = useCallback(async () => {
    const stored = getStoredSession();
    if (!stored?.accessToken) {
      setUser(null);
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const me = await api.getMe();
      setUser(me);
    } catch (err) {
      clearStoredSession();
      setUser(null);
      setError(err instanceof Error ? err.message : "Unable to restore session.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
    const handle = () => void refreshUser();
    window.addEventListener("aog-auth-change", handle);
    return () => window.removeEventListener("aog-auth-change", handle);
  }, [refreshUser]);

  useEffect(() => {
    if (loading) return;
    const isLoginRoute = pathname === "/login";
    if (!user && !isLoginRoute) {
      router.replace("/login");
      return;
    }
    if (user && isLoginRoute) {
      router.replace("/dashboard");
    }
  }, [loading, pathname, router, user]);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const session: SessionInfo = await api.login(email, password);
      setStoredSession({
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: session.expires_at,
        refreshExpiresAt: session.refresh_expires_at,
      });
      setUser(session.user);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
      setUser(null);
      setLoading(false);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [router]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      clearStoredSession();
    }
    clearStoredSession();
    setUser(null);
    router.replace("/login");
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      error,
      login,
      logout,
      refreshUser,
    }),
    [error, loading, login, logout, refreshUser, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}
