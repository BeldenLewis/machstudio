/**
 * 브리프 조회·정렬 — 어드민 화면·카톡 텍스트·공개 페이지가 **같은 순서**를 쓰게 한 곳에 둔다.
 * 화면마다 정렬을 따로 쓰면 "미리보기와 카톡 순서가 다르다" 가 반드시 생긴다.
 */
import { prisma } from "@/lib/prisma";
import { BRIEF_CATEGORIES } from "./model";

export const briefItemInclude = { shortLink: { select: { code: true } } } as const;

export type LoadedBriefItem = Awaited<ReturnType<typeof loadBriefItems>>[number];

export function loadBriefItems(briefId: string, where: { adopted?: boolean; unsentOnly?: boolean } = {}) {
  return prisma.briefItem.findMany({
    where: {
      briefId,
      ...(where.adopted !== undefined ? { adopted: where.adopted } : {}),
      ...(where.unsentOnly ? { issueId: null } : {}),
    },
    include: briefItemInclude,
  });
}

/**
 * 카테고리 고정 순서 → 그 안에서
 *   지원사업·행사: 날짜 이른 순(마감 임박이 위), 날짜 없는 것은 뒤
 *   뉴스: 최근 추가 순
 */
export function sortBriefItems<T extends { category: string; dueDate: Date | null; createdAt: Date }>(items: T[]): T[] {
  const order = new Map<string, number>(BRIEF_CATEGORIES.map((c, i) => [c.key, i]));
  return [...items].sort((a, b) => {
    const ca = order.get(a.category) ?? 9;
    const cb = order.get(b.category) ?? 9;
    if (ca !== cb) return ca - cb;
    if (a.category === "news") return b.createdAt.getTime() - a.createdAt.getTime();
    const da = a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
    const db = b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

export function toClientItem(item: LoadedBriefItem, shortBase: string) {
  return {
    id: item.id,
    category: item.category,
    org: item.org,
    title: item.title,
    url: item.url,
    dueDate: item.dueDate ? item.dueDate.toISOString() : null,
    dateLabel: item.dateLabel,
    source: item.source,
    note: item.note,
    adopted: item.adopted,
    issueId: item.issueId,
    shortUrl: item.shortLink ? `${shortBase}/r/${item.shortLink.code}` : null,
    createdAt: item.createdAt.toISOString(),
  };
}

export type ClientBriefItem = ReturnType<typeof toClientItem>;
