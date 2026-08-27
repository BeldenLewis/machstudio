import { Suspense } from "react";
import { ExpoProjectListLoader } from "@/components/expo/ExpoProjectListLoader";

/**
 * 홈페이지 목록 — **읽는 영역**이다.
 *
 * 시선 흐름을 헤드라인 → 짧은 설명 → 목록 순으로 둔다. 지표 카드를 늘어놓지 않는다:
 * 이 화면에서 내릴 결정은 "어느 홈페이지를 열까" 하나다.
 *
 * 목록 자체는 클라이언트에서 불러온다 — 현재 전시가 클라이언트 저장소에서
 * 하이드레이션되기 때문이다(그 함정은 로더 머리말에 적었다).
 */
export const dynamic = "force-dynamic";

export default function HomepageListPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 lg:px-8">
      <h1 className="text-xl font-semibold tracking-tight">홈페이지</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        전시 홈페이지의 페이지를 만들고, 완성된 것부터 하나씩 실제 사이트로 옮깁니다.
      </p>
      {/* useSearchParams 를 쓰는 로더라 경계가 필요하다. */}
      <Suspense fallback={null}>
        <ExpoProjectListLoader />
      </Suspense>
    </div>
  );
}
