"use client";

/**
 * 워크스페이스 게이트 하니스 — **개발 환경 전용**(프로덕션 404).
 *
 * 확인 대상이 "워크스페이스가 0 개일 때" 인데, 그 상태를 진짜로 만들려면 계정의 멤버십을
 * 다 지워야 한다(프로덕션 DB 를 건드린다). 그래서 WorkspaceProvider 가 읽는 목록 API 만
 * 가로채고, 게이트와 안내 화면 **본체는 그대로** 태운다.
 *
 * ?has=1 — 워크스페이스가 있는 상태. 게이트가 children 을 통과시키는지 본다(있는 사람에게
 * 안내가 새면 앱 전체가 막히므로 이쪽이 더 중요한 케이스다).
 */

import { useRef } from "react";
import { notFound } from "next/navigation";
import { WorkspaceProvider } from "@/contexts/workspace";
import { WorkspaceGate } from "@/app/(app)/workspace-gate";

const WORKSPACE = { id: "ws-1", name: "엑스포럼", slug: "exporum", role: "OWNER" };

export default function NoWorkspaceHarnessPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const has = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("has");

  // 렌더 본문에서 한 번만 — 자식(WorkspaceProvider) effect 보다 먼저 서야 첫 요청을 잡는다.
  const patched = useRef(false);
  if (typeof window !== "undefined" && !patched.current) {
    patched.current = true;
    const real = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/workspace")) {
        return Promise.resolve(
          Response.json(
            has
              ? { workspace: WORKSPACE, workspaces: [WORKSPACE], projects: [], isSuperAdmin: false }
              : { workspace: null, workspaces: [], projects: [], isSuperAdmin: false },
          ),
        );
      }
      return real(input, init);
    };
    try { localStorage.removeItem("currentWorkspaceId"); } catch { /* 무시 */ }
  }

  return (
    <WorkspaceProvider>
      <div className="p-4">
        <p className="mb-4 text-[11px] text-muted-foreground">
          개발 전용 · 워크스페이스 {has ? "1개" : "0개"} (?has=1 로 전환)
        </p>
        <WorkspaceGate>
          <div data-h="children" className="rounded-xl bg-secondary/40 p-6 text-sm">
            통과 — 원래 화면이 여기 그려집니다
          </div>
        </WorkspaceGate>
      </div>
    </WorkspaceProvider>
  );
}
