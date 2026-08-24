/**
 * 홈페이지 어드민의 **변경 규칙** — DB 를 모른 채 순수 함수로 둔다.
 *
 * 라우트는 조회 결과를 여기 넣고, 나온 결과를 저장한다. 규칙이 라우트 안에 흩어지면
 * "홈이 삭제됐다"·"순서가 어긋났다" 같은 것이 한 경로에서만 막힌다.
 *
 * ── 편집 충돌을 어떻게 다루나 ─────────────────────────────────────────
 * 두 탭에서 같은 페이지를 편집하면 나중 저장이 앞 저장을 조용히 덮는다. 그래서 draft 저장만
 * `draftRevision` 으로 비교-교환(CAS)한다. **발행·공개 스위치·순서 바꾸기는 CAS 를 쓰지 않는다** —
 * 그것들은 draft 를 건드리지 않는데, 같은 번호를 공유하면 자동저장이 도는 중에 발행이
 * 충돌로 막힌다.
 */
import type { ExpoPageConfig } from "@/lib/expo/types";
import { normalizeExpoPage } from "@/lib/expo/config";
import { slugFromTitle } from "@/lib/expo/model";
import { EXPO_LIMITS } from "@/lib/expo/registry";

export type ServiceError =
  | { kind: "conflict"; currentRevision: number }
  | { kind: "home-locked" }
  | { kind: "too-many-pages" }
  | { kind: "not-found" };

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; error: ServiceError };

const okv = <T>(value: T): ServiceResult<T> => ({ ok: true, value });
const err = <T>(error: ServiceError): ServiceResult<T> => ({ ok: false, error });

export function serviceStatus(error: ServiceError): number {
  switch (error.kind) {
    case "conflict": return 409;
    case "home-locked": return 409;
    case "too-many-pages": return 422;
    case "not-found": return 404;
  }
}

export function serviceMessage(error: ServiceError): string {
  switch (error.kind) {
    case "conflict": return "다른 곳에서 먼저 저장했어요. 최신 내용을 불러왔습니다.";
    case "home-locked": return "홈 페이지는 지우거나 순서를 바꿀 수 없어요.";
    case "too-many-pages": return `페이지는 ${EXPO_LIMITS.activePagesPerSite}개까지 만들 수 있어요.`;
    case "not-found": return "찾을 수 없어요";
  }
}

export interface PageRow {
  id: string;
  slug: string;
  title: string;
  isHome: boolean;
  sortOrder: number;
  draftRevision: number;
  deletedAt: Date | string | null;
}

/**
 * draft 저장 — **비교-교환**.
 *
 * 클라이언트가 자기가 읽은 번호를 같이 보낸다. 그 사이 다른 탭이 저장했으면 번호가 달라져
 * 409 로 막고 **최신 번호를 함께 돌려준다** — 화면이 그걸로 다시 읽어 사용자에게 보여 준다.
 * 자동으로 재시도하지 않는다: 덮어쓰면 남의 편집이 사라진다.
 */
export function prepareDraftWrite(
  current: { draftRevision: number },
  expectedRevision: number,
  nextDraft: unknown,
): ServiceResult<{ draft: ExpoPageConfig; draftRevision: number }> {
  if (current.draftRevision !== expectedRevision) {
    return err({ kind: "conflict", currentRevision: current.draftRevision });
  }
  return okv({
    // 저장되는 것은 항상 정규화를 통과한 값이다 — 라우트가 이미 크기를 검증했다.
    draft: normalizeExpoPage(nextDraft),
    draftRevision: current.draftRevision + 1,
  });
}

/**
 * 발행 — draft 를 **서버가 다시 정규화해서** published 에 복사한다.
 *
 * 클라이언트가 보낸 것을 그대로 굳히지 않는다. 발행본은 공개 로더가 읽는 유일한 원본이라,
 * 여기 들어간 것은 이미 검증을 통과한 것이어야 한다.
 * draftRevision 은 건드리지 않는다 — 발행이 진행 중인 자동저장을 충돌로 막으면 안 된다.
 */
export function preparePublish(page: { draft: unknown }): { published: ExpoPageConfig; publishedAt: Date } {
  return { published: normalizeExpoPage(page.draft), publishedAt: new Date() };
}

/** 공개 스위치. 발행본이 없으면 켤 수 없다 — 빈 화면을 내보내지 않는다. */
export function prepareLiveToggle(
  page: { published: unknown },
  live: boolean,
): ServiceResult<{ liveAt: Date | null }> {
  if (live && !page.published) return err({ kind: "not-found" });
  return okv({ liveAt: live ? new Date() : null });
}

/**
 * 새 페이지의 자리 — slug 충돌은 번호를 붙이고, 개수 상한을 넘으면 거절한다.
 */
export function prepareNewPage(
  existing: PageRow[],
  input: { title: string; slug?: string },
): ServiceResult<{ slug: string; title: string; isHome: false; sortOrder: number; draft: ExpoPageConfig }> {
  const active = existing.filter((p) => !p.deletedAt);
  if (active.length >= EXPO_LIMITS.activePagesPerSite) return err({ kind: "too-many-pages" });

  const title = String(input.title ?? "").trim() || "새 페이지";
  const slug = slugFromTitle(input.slug || title, active.map((p) => p.slug));
  return okv({
    slug,
    title,
    isHome: false,
    // 홈이 0 을 쓰므로 새 페이지는 항상 그 뒤다.
    sortOrder: Math.max(0, ...active.map((p) => p.sortOrder)) + 1,
    draft: { sections: [] },
  });
}

/**
 * 순서 재배치 — **홈은 항상 맨 위**다.
 *
 * 클라이언트가 보낸 순서를 그대로 믿지 않는다: 홈을 아래로 끌어내린 목록이 오면 홈을
 * 도로 맨 위로 올린다. 홈은 사이트의 첫 화면이라 트리에서 자리를 잃으면 안 된다.
 * 목록에 없는 id 나 남의 페이지 id 가 섞이면 거절한다.
 */
export function prepareReorder(
  existing: PageRow[],
  orderedIds: string[],
): ServiceResult<Array<{ id: string; sortOrder: number }>> {
  const active = existing.filter((p) => !p.deletedAt);
  const byId = new Map(active.map((p) => [p.id, p]));

  const seen = new Set<string>();
  const requested: PageRow[] = [];
  for (const id of orderedIds) {
    const page = byId.get(id);
    if (!page || seen.has(id)) return err({ kind: "not-found" });
    seen.add(id);
    requested.push(page);
  }
  // 빠뜨린 페이지는 뒤에 원래 순서대로 붙인다 — 목록이 잘려 와도 페이지가 사라지지 않는다.
  const missing = active.filter((p) => !seen.has(p.id)).sort((a, b) => a.sortOrder - b.sortOrder);
  const merged = [...requested, ...missing];

  const home = merged.find((p) => p.isHome);
  const rest = merged.filter((p) => !p.isHome);
  const final = home ? [home, ...rest] : rest;

  return okv(final.map((p, i) => ({ id: p.id, sortOrder: i })));
}

/** 삭제 — **홈은 못 지운다.** 소프트 삭제라 되돌릴 수 있다. */
export function prepareDeletePage(page: { isHome: boolean }): ServiceResult<{ deletedAt: Date }> {
  if (page.isHome) return err({ kind: "home-locked" });
  return okv({ deletedAt: new Date() });
}

/**
 * 목록·상세 응답에 실을 페이지 요약.
 * **draft 를 싣지 않는다** — 사이트 하나에 페이지가 50개까지라, 목록에 draft 를 담으면
 * 응답이 수 MB 가 되고 편집기가 쓰지도 않는다.
 */
export function pageSummary(page: PageRow & { published: unknown; liveAt: Date | string | null; imwebUrl: string | null }) {
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    isHome: page.isHome,
    sortOrder: page.sortOrder,
    imwebUrl: page.imwebUrl,
    // 상태 판정은 model.derivePageState 가 하지만, 목록은 원자재만 받아 화면에서 판정한다.
    hasPublished: Boolean(page.published),
    liveAt: page.liveAt,
  };
}
