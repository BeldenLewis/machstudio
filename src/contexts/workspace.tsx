"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

interface Project {
  id: string;
  name: string;
  description: string | null;
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
  role?: string;
  /**
   * 등록 폼 약관 전문 템플릿 — 웨비나가 자기 값을 비워 두면 이 값을 상속한다.
   * 목록 API(/api/workspace)에는 없고 상세(/api/workspace/[id])에만 있어 optional 이다.
   */
  privacyBodyTemplate?: string | null;
  marketingBodyTemplate?: string | null;
}

interface WorkspaceContextType {
  workspace: Workspace | null;
  workspaces: Workspace[];
  projects: Project[];
  currentProject: Project | null;
  setCurrentProject: (project: Project) => void;
  switchWorkspace: (workspace: Workspace) => Promise<void>;
  refreshProjects: () => Promise<void>;
  refreshWorkspaces: () => Promise<Workspace[]>;
  isLoading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProjectState] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const setCurrentProject = (project: Project) => {
    setCurrentProjectState(project);
    localStorage.setItem("currentProjectId", project.id);
  };

  const applyProjects = (newProjects: Project[]) => {
    setProjects(newProjects);
    const savedId = localStorage.getItem("currentProjectId");
    const saved = newProjects.find((p) => p.id === savedId);
    setCurrentProjectState(saved ?? newProjects[0] ?? null);
  };

  const refreshProjects = useCallback(async () => {
    const currentWsId = localStorage.getItem("currentWorkspaceId");
    const url = currentWsId ? `/api/workspace/${currentWsId}` : "/api/workspace";
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    if (data.workspace) setWorkspace(data.workspace);
    if (data.workspaces) setWorkspaces(data.workspaces);
    applyProjects(data.projects ?? []);
  }, []);

  // 워크스페이스 목록만 다시 가져오기 — 워크스페이스 생성/삭제 후 즉시 반영용.
  const refreshWorkspaces = useCallback(async () => {
    const res = await fetch("/api/workspace");
    if (!res.ok) return [];
    const data = await res.json();
    const list: Workspace[] = data.workspaces ?? [];
    setWorkspaces(list);
    // 현재 선택된 워크스페이스가 사라졌으면 첫 번째로 전환.
    const currentWsId = localStorage.getItem("currentWorkspaceId");
    const stillExists = list.find((w) => w.id === currentWsId);
    if (!stillExists && list.length > 0) {
      localStorage.setItem("currentWorkspaceId", list[0].id);
      localStorage.removeItem("currentProjectId");
      setWorkspace(list[0]);
      const wsRes = await fetch(`/api/workspace/${list[0].id}`);
      if (wsRes.ok) {
        const wsData = await wsRes.json();
        applyProjects(wsData.projects ?? []);
      }
    } else if (list.length === 0) {
      setWorkspace(null);
      setProjects([]);
      setCurrentProjectState(null);
    }
    return list;
  }, []);

  const switchWorkspace = useCallback(async (ws: Workspace) => {
    localStorage.setItem("currentWorkspaceId", ws.id);
    localStorage.removeItem("currentProjectId");
    setWorkspace(ws);
    const [wsListRes, wsRes] = await Promise.all([
      fetch("/api/workspace"),
      fetch(`/api/workspace/${ws.id}`),
    ]);
    if (wsListRes.ok) {
      const listData = await wsListRes.json();
      setWorkspaces(listData.workspaces ?? []);
    }
    if (!wsRes.ok) return;
    const data = await wsRes.json();
    applyProjects(data.projects ?? []);
  }, []);

  useEffect(() => {
    const init = async () => {
      const res = await fetch("/api/workspace");
      if (!res.ok) return;
      const data = await res.json();
      setWorkspaces(data.workspaces ?? []);

      const savedWsId = localStorage.getItem("currentWorkspaceId");
      const savedWs = (data.workspaces ?? []).find((w: Workspace) => w.id === savedWsId);
      const activeWs = savedWs ?? data.workspace;

      if (activeWs) {
        setWorkspace(activeWs);
        if (activeWs.id !== data.workspace?.id) {
          const wsRes = await fetch(`/api/workspace/${activeWs.id}`);
          const wsData = await wsRes.json();
          applyProjects(wsData.projects ?? []);
        } else {
          applyProjects(data.projects ?? []);
        }
      }
    };
    init().finally(() => setIsLoading(false));
  }, []);

  // 마지막 활동 시각 갱신 — 하루 1회만 (localStorage throttle). 세션 유지 사용자의
  // 실제 접속을 추적하기 위함 (last_sign_in_at은 명시적 로그인만 갱신됨).
  useEffect(() => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem("mach_heartbeat") !== today) {
        fetch("/api/heartbeat", { method: "POST" })
          .then((r) => { if (r.ok) localStorage.setItem("mach_heartbeat", today); })
          .catch(() => {});
      }
    } catch {}
  }, []);

  return (
    <WorkspaceContext.Provider value={{
      workspace, workspaces, projects, currentProject,
      setCurrentProject, switchWorkspace, refreshProjects, refreshWorkspaces, isLoading,
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
