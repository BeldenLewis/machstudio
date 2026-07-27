"use client";

/**
 * 워크스페이스 없는 사용자를 안내 화면으로 돌린다.
 *
 * 왜 레이아웃에 두나: 예전에는 가입 직후 `/onboarding` 을 **강제로** 거쳐 워크스페이스가
 * 반드시 있었다. 그 강제 단계를 없애면 워크스페이스 0 개인 상태가 정상 경로가 되는데,
 * 각 화면은 그 상태를 "데이터가 없다" 로만 그린다(대시보드는 fetch 를 건너뛰고 빈 화면).
 * 화면마다 안내를 심으면 한 곳씩 빠지므로 들어오는 문에서 한 번 판정한다.
 *
 * 예외 두 곳은 **워크스페이스가 없어도 할 일이 있는 화면**이라 그대로 통과시킨다:
 *   · /admin — 전역 관리자. 워크스페이스와 무관한 데이터를 본다(막으면 초대해 줄 사람이
 *     자기 화면에 못 들어가는 잠김이 생긴다).
 *   · /settings — 개인 설정. 워크스페이스를 참조하지 않는다(하위 /settings/workspace 는
 *     워크스페이스가 필요하므로 정확히 일치할 때만 통과시킨다).
 */

import { usePathname } from "next/navigation";
import { useWorkspace } from "@/contexts/workspace";
import { NoWorkspace } from "@/components/workspace/no-workspace";

export function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const { workspaces, isLoading } = useWorkspace();
  const pathname = usePathname();

  const exempt = pathname === "/settings" || pathname.startsWith("/admin");
  // 로딩 중에는 통과 — 각 화면이 자기 로딩 상태를 그린다. 여기서 안내를 먼저 띄우면
  // 워크스페이스가 있는 사람에게도 "없어요" 가 한 번 번쩍인다.
  if (isLoading || exempt || workspaces.length > 0) return children;

  return <NoWorkspace />;
}
