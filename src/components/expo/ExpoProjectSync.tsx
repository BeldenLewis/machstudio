"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/contexts/workspace";

/**
 * 상세 화면에 들어왔을 때 사이드바의 전시를 **그 사이트의 전시로** 맞춘다.
 *
 * ── 왜 필요한가 ───────────────────────────────────────────────────────
 * 딥링크로 상세에 바로 들어오면 사이드바에는 엉뚱한 전시가 떠 있다. 그 상태에서 화면이
 * 형제 자원(사전등록 소스 목록 등)을 사이드바 문맥으로 조회하면 **다른 전시의 것**이
 * 섞인다. 이 저장소는 그 사고를 겪었다 — 웨비나 배포 탭이 사이드바의 현재 프로젝트로
 * 아임웹 사이트를 조회·변경해서, 딥링크로 들어오면 다른 전시의 공개 노출이 성공
 * 토스트와 함께 바뀌었다(AGENTS.md "새 면을 만들 때" ②).
 *
 * 소속은 **URL 자원**(siteId)에서 온다. 이 컴포넌트는 그걸 사이드바에 반영할 뿐이다.
 *
 * ── 나중에 전시를 바꾸면 ──────────────────────────────────────────────
 * 상세를 열어 둔 채 전시를 바꾸면 **목록으로 보낸다.** 그 자리에 남아 있으면 화면은 새
 * 전시인데 저장은 옛 사이트로 들어간다 — 보이지 않는 변경이다.
 */
export function ExpoProjectSync({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { projects, currentProject, setCurrentProject, isLoading } = useWorkspace();

  /** 처음 맞춘 전시. 이 값과 달라지면 사용자가 직접 바꾼 것이다. */
  const synced = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading) return;

    if (synced.current === null) {
      if (currentProject?.id === projectId) {
        synced.current = projectId;
        return;
      }
      const target = projects.find((p) => p.id === projectId);
      // 목록에 없다 — 다른 워크스페이스이거나 아직 안 왔다. 서버가 이미 소유권을 확인했으므로
      // 화면을 깨뜨리지 않고 그냥 기다린다.
      if (!target) return;
      setCurrentProject(target);
      synced.current = projectId;
      return;
    }

    // 맞춘 뒤에 달라졌다 = 사용자가 사이드바에서 전시를 바꿨다.
    if (currentProject && currentProject.id !== projectId) {
      router.replace("/homepage?list=1");
    }
  }, [isLoading, projects, currentProject, projectId, setCurrentProject, router]);

  return null;
}
