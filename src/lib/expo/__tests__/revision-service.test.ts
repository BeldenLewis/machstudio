import { describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma";
import {
  publishPageRevision,
  rollbackPageRevision,
  type RevisionServiceInput,
} from "@/lib/expo/revision-service";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const section = (n: number, over: Record<string, unknown> = {}) => ({
  sid: uid(n),
  type: "textblock",
  variant: "prose",
  enabled: true,
  embedEnabled: false,
  design: {},
  content: { body: `본문 ${n}` },
  ...over,
});
const snapshot = (sections: unknown[]) => ({ schemaVersion: 2, sections });

interface PageState {
  id: string;
  draft: unknown;
  draftRevision: number;
  published: unknown;
  publishedAt: Date | null;
  liveAt: Date | null;
}

interface RevisionState {
  id: string;
  pageId: string;
  sequence: number;
  snapshot: unknown;
  codeDigest: string;
  publishedBy: string;
  createdAt: Date;
}

type FailurePoint = "update" | "create" | "prune";

/**
 * 실제 DB를 열지 않는다. FOR UPDATE 호출 때 얻는 mutex와 commit/rollback만 흉내 내서
 * 서비스가 트랜잭션 클라이언트 밖으로 새는지, 실패가 원자적으로 되감기는지 검사한다.
 */
class FakeRevisionDb {
  pages: PageState[];
  revisions: RevisionState[];
  events: string[] = [];
  lockQueries: Array<{ strings?: readonly string[]; values?: readonly unknown[] }> = [];
  failOn?: FailurePoint;
  private nextRevisionId = 1;
  private lockTail: Promise<void> = Promise.resolve();

  constructor(page: PageState, revisions: RevisionState[] = []) {
    this.pages = [structuredClone(page)];
    this.revisions = structuredClone(revisions);
    this.nextRevisionId = revisions.length + 1;
  }

  private async acquireLock(): Promise<() => void> {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const previous = this.lockTail;
    this.lockTail = previous.then(() => held);
    await previous;
    return release;
  }

  async transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const before = structuredClone({ pages: this.pages, revisions: this.revisions });
    let release: (() => void) | undefined;
    const tx = {
      $queryRaw: async (query: { strings?: readonly string[]; values?: readonly unknown[] }) => {
        release = await this.acquireLock();
        this.events.push("lock");
        this.lockQueries.push(query);
        return [{ id: this.pages[0]?.id }];
      },
      expoPage: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          this.events.push("reload-page");
          return structuredClone(this.pages.find((page) => page.id === where.id) ?? null);
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          this.events.push("update-page");
          if (this.failOn === "update") throw new Error("fake update failure");
          const page = this.pages.find((item) => item.id === where.id);
          if (!page) throw new Error("missing fake page");
          Object.assign(page, structuredClone(data));
          return { id: page.id };
        },
      },
      expoPageRevision: {
        aggregate: async ({ where }: { where: { pageId: string } }) => {
          this.events.push("max-sequence");
          const values = this.revisions.filter((item) => item.pageId === where.pageId).map((item) => item.sequence);
          return { _max: { sequence: values.length ? Math.max(...values) : null } };
        },
        findFirst: async ({ where }: { where: { id?: string; pageId: string } }) => {
          if (where.id) {
            this.events.push("load-rollback-revision");
            return structuredClone(this.revisions.find((item) => item.id === where.id && item.pageId === where.pageId) ?? null);
          }
          this.events.push("max-sequence");
          const rows = this.revisions.filter((item) => item.pageId === where.pageId).sort((a, b) => b.sequence - a.sequence);
          return rows[0] ? { sequence: rows[0].sequence } : null;
        },
        create: async ({ data }: { data: Omit<RevisionState, "id" | "createdAt"> & { createdAt?: Date } }) => {
          this.events.push("create-revision");
          if (this.failOn === "create") throw new Error("fake create failure");
          const created: RevisionState = {
            ...structuredClone(data),
            id: `rev-created-${this.nextRevisionId++}`,
            createdAt: data.createdAt ?? new Date(),
          };
          this.revisions.push(created);
          return structuredClone(created);
        },
        findMany: async ({ where, skip }: { where: { pageId: string }; skip: number }) => {
          this.events.push("find-prunable");
          return this.revisions
            .filter((item) => item.pageId === where.pageId)
            .sort((a, b) => b.sequence - a.sequence)
            .slice(skip)
            .map(({ id }) => ({ id }));
        },
        deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
          this.events.push("prune-revisions");
          if (this.failOn === "prune") throw new Error("fake prune failure");
          const doomed = new Set(where.id.in);
          this.revisions = this.revisions.filter((item) => !doomed.has(item.id));
          return { count: doomed.size };
        },
      },
    } as unknown as Prisma.TransactionClient;

    try {
      return await work(tx);
    } catch (error) {
      this.pages = before.pages;
      this.revisions = before.revisions;
      throw error;
    } finally {
      release?.();
    }
  }
}

const page = (over: Partial<PageState> = {}): PageState => ({
  id: "pg1",
  draft: snapshot([section(1)]),
  draftRevision: 7,
  published: null,
  publishedAt: null,
  liveAt: null,
  ...over,
});

const input = (over: Partial<RevisionServiceInput> = {}): RevisionServiceInput => ({
  pageId: "pg1",
  publishedBy: "user-1",
  publicEmbedEnabled: true,
  now: new Date("2026-09-01T04:00:00.000Z"),
  ...over,
});

const oldRevision = (sequence: number, over: Partial<RevisionState> = {}): RevisionState => ({
  id: `rev-${sequence}`,
  pageId: "pg1",
  sequence,
  snapshot: snapshot([section(sequence)]),
  codeDigest: `digest-${sequence}`,
  publishedBy: "older-user",
  createdAt: new Date(`2026-08-${String(Math.min(sequence, 28)).padStart(2, "0")}T00:00:00.000Z`),
  ...over,
});

describe("publishPageRevision", () => {
  it("locks the URL-owned page first with a parameterized query, then reloads it", async () => {
    const db = new FakeRevisionDb(page());
    await db.transaction((tx) => publishPageRevision(tx, input()));

    expect(db.events[0]).toBe("lock");
    expect(db.events[1]).toBe("reload-page");
    expect(db.lockQueries[0].values).toContain("pg1");
    expect(db.lockQueries[0].strings?.join("")).not.toContain("pg1");
  });

  it("serializes concurrent publishes so they receive distinct sequences", async () => {
    const db = new FakeRevisionDb(page());
    const [first, second] = await Promise.all([
      db.transaction((tx) => publishPageRevision(tx, input({ publishedBy: "user-a" }))),
      db.transaction((tx) => publishPageRevision(tx, input({ publishedBy: "user-b" }))),
    ]);

    expect(first.ok && first.sequence).toBe(1);
    expect(second.ok && second.sequence).toBe(2);
    expect(db.revisions.map((item) => item.sequence)).toEqual([1, 2]);
  });

  it("retains only the latest 20 revisions after the 21st publish", async () => {
    const db = new FakeRevisionDb(page());
    for (let i = 1; i <= 21; i += 1) {
      const result = await db.transaction((tx) => publishPageRevision(tx, input({
        now: new Date(`2026-09-01T04:${String(i).padStart(2, "0")}:00.000Z`),
      })));
      expect(result.ok).toBe(true);
    }

    expect(db.revisions.map((item) => item.sequence).sort((a, b) => a - b))
      .toEqual(Array.from({ length: 20 }, (_, index) => index + 2));
  });

  it.each<FailurePoint>(["update", "create", "prune"])(
    "rolls back every mutation when %s fails",
    async (failure) => {
      const seeded = failure === "prune"
        ? Array.from({ length: 20 }, (_, index) => oldRevision(index + 1))
        : [];
      const db = new FakeRevisionDb(page({ published: snapshot([section(9)]) }), seeded);
      const before = structuredClone({ pages: db.pages, revisions: db.revisions });
      db.failOn = failure;

      await expect(db.transaction((tx) => publishPageRevision(tx, input())))
        .rejects.toThrow(`fake ${failure} failure`);
      expect({ pages: db.pages, revisions: db.revisions }).toEqual(before);
    },
  );

  it("returns strict structure failures as declared 422 field issues", async () => {
    const db = new FakeRevisionDb(page({ draft: { schemaVersion: 2, sections: [{ sid: "bad", type: "textblock" }] } }));
    const result = await db.transaction((tx) => publishPageRevision(tx, input()));

    expect(result).toEqual(expect.objectContaining({
      ok: false, status: 422, code: "publish-readiness-failed",
      issues: [expect.objectContaining({ path: "sections[0].sid", code: "invalid-sid", severity: "error" })],
    }));
    expect(db.events).not.toContain("update-page");
  });
});

describe("rollbackPageRevision", () => {
  it("creates sequence 22 without changing draft, draftRevision, or liveAt", async () => {
    const revisions = Array.from({ length: 21 }, (_, index) => oldRevision(index + 1));
    const liveAt = new Date("2026-09-01T03:00:00.000Z");
    const db = new FakeRevisionDb(page({
      draft: snapshot([section(99)]), draftRevision: 14,
      published: snapshot([section(88)]), liveAt,
    }), revisions);
    const beforeDraft = structuredClone(db.pages[0].draft);

    const result = await db.transaction((tx) => rollbackPageRevision(tx, {
      ...input(), revisionId: "rev-5",
    }));

    expect(result.ok && result.sequence).toBe(22);
    expect(result.ok && db.pages[0].published).toEqual(result.ok && result.snapshot);
    expect(db.pages[0].draft).toEqual(beforeDraft);
    expect(db.pages[0].draftRevision).toBe(14);
    expect(db.pages[0].liveAt).toEqual(liveAt);
  });

  it("never accepts a revision from another URL-owned page", async () => {
    const foreign = oldRevision(1, { id: "foreign", pageId: "pg-other" });
    const db = new FakeRevisionDb(page(), [foreign]);

    await expect(db.transaction((tx) => rollbackPageRevision(tx, {
      ...input(), revisionId: "foreign",
    }))).rejects.toThrow(/revision/i);
    expect(db.events).not.toContain("update-page");
  });
});

describe("public embed release gate", () => {
  it.each(["publish", "rollback"] as const)("blocks newly enabled standalone embed on %s", async (kind) => {
    const current = snapshot([section(1, { embedEnabled: false })]);
    const candidate = snapshot([section(1, { embedEnabled: true })]);
    const db = new FakeRevisionDb(page({ draft: candidate, published: current }), [
      oldRevision(1, { id: "target", snapshot: candidate }),
    ]);

    const result = await db.transaction((tx) => kind === "publish"
      ? publishPageRevision(tx, input({ publicEmbedEnabled: false }))
      : rollbackPageRevision(tx, { ...input({ publicEmbedEnabled: false }), revisionId: "target" }));

    expect(result).toEqual(expect.objectContaining({
      ok: false, status: 422, code: "public-embed-release-disabled",
      issues: [expect.objectContaining({
        path: "sections[0].embedEnabled", code: "launch-locked-embed", severity: "error", sid: uid(1),
      })],
    }));
    expect(db.events).not.toContain("update-page");
  });

  it.each(["publish", "rollback"] as const)("blocks a newly renderable live section on %s", async (kind) => {
    const current = snapshot([section(1)]);
    const candidate = snapshot([section(1), section(2)]);
    const db = new FakeRevisionDb(page({
      draft: candidate,
      published: current,
      liveAt: new Date("2026-09-01T03:00:00.000Z"),
    }), [oldRevision(1, { id: "target", snapshot: candidate })]);

    const result = await db.transaction((tx) => kind === "publish"
      ? publishPageRevision(tx, input({ publicEmbedEnabled: false }))
      : rollbackPageRevision(tx, { ...input({ publicEmbedEnabled: false }), revisionId: "target" }));

    expect(result).toEqual(expect.objectContaining({
      ok: false, status: 422, code: "public-embed-release-disabled",
      issues: [expect.objectContaining({
        path: "sections[1].enabled", code: "launch-locked-live", severity: "error", sid: uid(2),
      })],
    }));
  });

  it.each(["publish", "rollback"] as const)("allows edits to an unchanged already-public surface on %s", async (kind) => {
    const current = snapshot([section(1, { embedEnabled: true, content: { body: "기존 본문" } })]);
    const candidate = snapshot([section(1, { embedEnabled: true, content: { body: "고친 본문" } })]);
    const db = new FakeRevisionDb(page({
      draft: candidate,
      published: current,
      liveAt: new Date("2026-09-01T03:00:00.000Z"),
    }), [oldRevision(1, { id: "target", snapshot: candidate })]);

    const result = await db.transaction((tx) => kind === "publish"
      ? publishPageRevision(tx, input({ publicEmbedEnabled: false }))
      : rollbackPageRevision(tx, { ...input({ publicEmbedEnabled: false }), revisionId: "target" }));

    expect(result.ok).toBe(true);
  });
});
