"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";
import type { EnvironmentStatus, WorkspaceDetail, WorkspaceSummary } from "@/lib/types";

const STORAGE_KEY = "aog-sentinel:workspace-id";

interface WorkspaceContextValue {
  workspaces: WorkspaceSummary[];
  workspace: WorkspaceDetail | null;
  environment: EnvironmentStatus | null;
  workspaceId: string | null;
  loading: boolean;
  error: string | null;
  selectWorkspace: (workspaceId: string) => Promise<void>;
  refreshWorkspace: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null);
  const [environment, setEnvironment] = useState<EnvironmentStatus | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspace = useCallback(async (targetWorkspaceId?: string | null, knownWorkspaces?: WorkspaceSummary[]) => {
    setLoading(true);
    setError(null);
    try {
      const [workspaceData, environmentData, workspaceList] = await Promise.all([
        api.getCurrentWorkspace(targetWorkspaceId || undefined),
        api.getEnvironmentStatus(),
        knownWorkspaces ? Promise.resolve(knownWorkspaces) : api.getWorkspaces(),
      ]);

      setWorkspaces(workspaceList);
      setWorkspace(workspaceData);
      setEnvironment(environmentData);
      setWorkspaceId(workspaceData.workspace_id);
      window.localStorage.setItem(STORAGE_KEY, workspaceData.workspace_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load workspace context.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      if (authLoading) return;
      if (!isAuthenticated || pathname === "/login") {
        setWorkspaces([]);
        setWorkspace(null);
        setEnvironment(null);
        setWorkspaceId(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const workspaceList = await api.getWorkspaces();
        if (!active) return;

        const persistedId = window.localStorage.getItem(STORAGE_KEY);
        const resolvedWorkspaceId =
          persistedId && workspaceList.some((item) => item.workspace_id === persistedId)
            ? persistedId
            : workspaceList[0]?.workspace_id;

        await loadWorkspace(resolvedWorkspaceId, workspaceList);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load workspace registry.");
        setLoading(false);
      }
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, [authLoading, isAuthenticated, loadWorkspace, pathname]);

  const selectWorkspace = useCallback(
    async (nextWorkspaceId: string) => {
      if (nextWorkspaceId === workspaceId && workspace) return;
      await loadWorkspace(nextWorkspaceId, workspaces.length ? workspaces : undefined);
    },
    [loadWorkspace, workspace, workspaceId, workspaces]
  );

  const refreshWorkspace = useCallback(async () => {
    if (!isAuthenticated) return;
    await loadWorkspace(workspaceId, workspaces.length ? workspaces : undefined);
  }, [isAuthenticated, loadWorkspace, workspaceId, workspaces]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaces,
      workspace,
      environment,
      workspaceId,
      loading,
      error,
      selectWorkspace,
      refreshWorkspace,
    }),
    [environment, error, loading, refreshWorkspace, selectWorkspace, workspace, workspaceId, workspaces]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider.");
  }
  return context;
}
