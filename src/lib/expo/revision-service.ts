import { Prisma } from "@/generated/prisma";
import { normalizeExpoPage } from "@/lib/expo/config";
import { hasContent } from "@/lib/expo/model";
import { EXPO_READINESS_MESSAGES, publishErrors } from "@/lib/expo/readiness";
import { snapshotDigest } from "@/lib/expo/snapshot-digest";
import type { ExpoPageConfigV2, FieldIssue } from "@/lib/expo/types";

export interface RevisionServiceInput {
  pageId: string;
  /** URL-owned page가 사전 조회 때 속해 있던 사이트. lock 뒤에도 같은 소속인지 재확인한다. */
  siteId: string;
  publishedBy: string;
  publicEmbedEnabled: boolean;
  now: Date;
}

export interface RevisionServiceSuccess {
  ok: true;
  pageId: string;
  revisionId: string;
  sequence: number;
  codeDigest: string;
  snapshot: ExpoPageConfigV2;
}

export type RevisionServiceFailure = {
  ok: false;
  status: 404 | 422;
  code: "page-not-found" | "publish-readiness-failed" | "public-embed-release-disabled";
  issues: FieldIssue[];
};

export type RevisionServiceResult = RevisionServiceSuccess | RevisionServiceFailure;

type LockedPage = {
  id: string;
  draft: Prisma.JsonValue;
  published: Prisma.JsonValue | null;
  liveAt: Date | null;
};

const inactivePage = (): RevisionServiceFailure => ({
  ok: false,
  status: 404,
  code: "page-not-found",
  issues: [],
});

function asFieldIssues(raw: unknown): FieldIssue[] {
  return publishErrors(raw);
}

function releaseGateIssues(
  candidate: ExpoPageConfigV2,
  publishedRaw: unknown,
  liveAt: Date | null,
): FieldIssue[] {
  const published = normalizeExpoPage(publishedRaw);
  const before = new Map(published.sections.map((section) => [section.sid, section]));
  const issues: FieldIssue[] = [];

  candidate.sections.forEach((section, index) => {
    const prior = before.get(section.sid);
    if (section.embedEnabled && prior?.embedEnabled !== true) {
      issues.push({
        path: `sections[${index}].embedEnabled`,
        code: "launch-locked-embed",
        message: EXPO_READINESS_MESSAGES["launch-locked-embed"],
        severity: "error",
        sid: section.sid,
      });
    }
    const nowRenderable = section.enabled && hasContent(section);
    const wasRenderable = !!prior && prior.enabled && hasContent(prior);
    if (liveAt && nowRenderable && !wasRenderable) {
      issues.push({
        path: `sections[${index}].enabled`,
        code: "launch-locked-live",
        message: EXPO_READINESS_MESSAGES["launch-locked-live"],
        severity: "error",
        sid: section.sid,
      });
    }
  });

  return issues;
}

async function lockAndReloadPage(
  tx: Prisma.TransactionClient,
  input: Pick<RevisionServiceInput, "pageId" | "siteId">,
): Promise<LockedPage | null> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT page."id"
      FROM "ExpoPage" AS page
      INNER JOIN "ExpoSite" AS site ON site."id" = page."siteId"
     WHERE page."id" = ${input.pageId}
       AND page."siteId" = ${input.siteId}
       AND page."deletedAt" IS NULL
       AND site."deletedAt" IS NULL
     FOR UPDATE OF page, site
  `);
  if (locked.length === 0) return null;

  const page = await tx.expoPage.findFirst({
    where: {
      id: input.pageId,
      siteId: input.siteId,
      deletedAt: null,
      site: { deletedAt: null },
    },
    select: { id: true, draft: true, published: true, liveAt: true },
  });
  if (!page) return null;
  return page;
}

async function recordRevision(
  tx: Prisma.TransactionClient,
  page: LockedPage,
  candidateRaw: unknown,
  input: RevisionServiceInput,
): Promise<RevisionServiceResult> {
  const issues = asFieldIssues(candidateRaw);
  if (issues.length > 0) {
    return { ok: false, status: 422, code: "publish-readiness-failed", issues };
  }

  const snapshot = normalizeExpoPage(candidateRaw);
  if (!input.publicEmbedEnabled) {
    const releaseIssues = releaseGateIssues(snapshot, page.published, page.liveAt);
    if (releaseIssues.length > 0) {
      return {
        ok: false,
        status: 422,
        code: "public-embed-release-disabled",
        issues: releaseIssues,
      };
    }
  }

  const latest = await tx.expoPageRevision.aggregate({
    where: { pageId: input.pageId },
    _max: { sequence: true },
  });
  const sequence = (latest._max.sequence ?? 0) + 1;
  const codeDigest = snapshotDigest(snapshot);
  const storedSnapshot = JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue;

  await tx.expoPage.update({
    where: { id: input.pageId },
    data: { published: storedSnapshot, publishedAt: input.now },
    select: { id: true },
  });
  const revision = await tx.expoPageRevision.create({
    data: {
      pageId: input.pageId,
      sequence,
      snapshot: storedSnapshot,
      codeDigest,
      publishedBy: input.publishedBy,
      createdAt: input.now,
    },
    select: { id: true },
  });

  const prunable = await tx.expoPageRevision.findMany({
    where: { pageId: input.pageId },
    orderBy: { sequence: "desc" },
    skip: 20,
    select: { id: true },
  });
  if (prunable.length > 0) {
    await tx.expoPageRevision.deleteMany({
      where: { pageId: input.pageId, id: { in: prunable.map(({ id }) => id) } },
    });
  }

  return {
    ok: true,
    pageId: input.pageId,
    revisionId: revision.id,
    sequence,
    codeDigest,
    snapshot,
  };
}

export async function publishPageRevision(
  tx: Prisma.TransactionClient,
  input: RevisionServiceInput,
): Promise<RevisionServiceResult> {
  const page = await lockAndReloadPage(tx, input);
  if (!page) return inactivePage();
  return recordRevision(tx, page, page.draft, input);
}

export async function rollbackPageRevision(
  tx: Prisma.TransactionClient,
  input: RevisionServiceInput & { revisionId: string },
): Promise<RevisionServiceResult> {
  const page = await lockAndReloadPage(tx, input);
  if (!page) return inactivePage();
  const target = await tx.expoPageRevision.findFirst({
    where: { id: input.revisionId, pageId: input.pageId },
    select: { snapshot: true },
  });
  if (!target) throw new Error("Expo revision not found for URL page");
  return recordRevision(tx, page, target.snapshot, input);
}
