import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

type Keep = "latest" | "oldest";
type Mode = "duplicates" | "empty";

interface CleanupBody {
  mode?: Mode;
  keyField?: string;
  keep?: Keep;
  dryRun?: boolean;
}

// 기준 필드값으로 그룹핑한 뒤 keep 정책에 따라 살릴 1건을 정하고 나머지 ID를 반환
function planDeletion(
  records: { id: string; data: unknown; createdAt: Date }[],
  keyField: string,
  keep: Keep,
): { groups: number; toDelete: string[]; sampleGroups: Array<{ key: string; total: number; kept: string; deleted: string[] }> } {
  const groups = new Map<string, { id: string; createdAt: Date }[]>();
  for (const r of records) {
    const data = (r.data ?? {}) as Record<string, unknown>;
    const raw = data[keyField];
    if (raw === undefined || raw === null) continue;
    const normalized = String(raw).trim().toLowerCase();
    if (!normalized) continue;
    if (!groups.has(normalized)) groups.set(normalized, []);
    groups.get(normalized)!.push({ id: r.id, createdAt: r.createdAt });
  }

  const toDelete: string[] = [];
  const sampleGroups: Array<{ key: string; total: number; kept: string; deleted: string[] }> = [];
  let dupGroupCount = 0;

  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    dupGroupCount++;
    const sorted = list.slice().sort((a, b) =>
      keep === "latest"
        ? b.createdAt.getTime() - a.createdAt.getTime()
        : a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const [kept, ...rest] = sorted;
    const deletedIds = rest.map((r) => r.id);
    toDelete.push(...deletedIds);
    if (sampleGroups.length < 10) {
      sampleGroups.push({ key, total: list.length, kept: kept.id, deleted: deletedIds });
    }
  }

  return { groups: dupGroupCount, toDelete, sampleGroups };
}

/**
 * 지정한 필드가 비어있는 레코드를 전부 삭제 대상으로 잡는다 (중복 정리와 달리 1건도 안 남긴다).
 *
 * 앵커/위치 매칭이 실패하면 대행전시 스크립트가 이름·이메일 같은 핵심 필드가 통째로 빈
 * 레코드를 만들어낸다(collect-script.ts 주석 — "성공 문구가 폼이 아닌 페이지에서 잡히면
 * collectData 가 {} 를 내는데, {} 는 truthy 라 그대로 빈 레코드가 저장된다"). 그 쓰레기를
 * 지우는 용도라 "값이 있으면 스킵"인 planDeletion 과 정반대로 "값이 없으면 삭제"다.
 */
function planEmptyDeletion(
  records: { id: string; data: unknown; createdAt: Date }[],
  keyField: string,
): { toDelete: string[]; sample: Array<{ id: string; createdAt: string; snippet: string }> } {
  const toDelete: string[] = [];
  const sample: Array<{ id: string; createdAt: string; snippet: string }> = [];
  for (const r of records) {
    const data = (r.data ?? {}) as Record<string, unknown>;
    const raw = data[keyField];
    const normalized = raw == null ? "" : String(raw).trim();
    if (normalized) continue;
    toDelete.push(r.id);
    if (sample.length < 10) {
      const otherVals = Object.entries(data)
        .filter(([k, v]) => k !== keyField && v != null && String(v).trim() !== "")
        .slice(0, 3)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      sample.push({ id: r.id, createdAt: r.createdAt.toISOString(), snippet: otherVals || "(다른 필드도 전부 비어있음)" });
    }
  }
  return { toDelete, sample };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const source = await prisma.collectSource.findUnique({ where: { id } });
  if (!source) return NextResponse.json({ error: "소스를 찾을 수 없어요" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: source.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });
  if (membership.role === "MEMBER") return NextResponse.json({ error: "권한 없음 (ADMIN 이상)" }, { status: 403 });

  const body: CleanupBody = await request.json().catch(() => ({}));
  const mode: Mode = body.mode === "empty" ? "empty" : "duplicates";
  const keyField = body.keyField?.trim();
  const keep: Keep = body.keep === "oldest" ? "oldest" : "latest";
  const dryRun = !!body.dryRun;

  if (!keyField) {
    return NextResponse.json({ error: "기준 필드(keyField)가 필요해요" }, { status: 400 });
  }

  const records = await prisma.collectRecord.findMany({
    where: { sourceId: id },
    select: { id: true, data: true, createdAt: true },
  });

  if (mode === "empty") {
    const { toDelete, sample } = planEmptyDeletion(records, keyField);

    if (dryRun) {
      return NextResponse.json({ mode, toDelete: toDelete.length, sample, deleted: 0 });
    }
    if (toDelete.length === 0) {
      return NextResponse.json({ mode, deleted: 0, sample: [] });
    }

    const result = await prisma.collectRecord.deleteMany({
      where: { sourceId: id, id: { in: toDelete } },
    });

    await logActivity({
      workspaceId: source.workspaceId,
      sourceId: source.id,
      userId: user.id,
      action: "records.cleaned",
      meta: { mode, keyField, deleted: result.count },
    });

    return NextResponse.json({ mode, deleted: result.count, sample });
  }

  const { groups, toDelete, sampleGroups } = planDeletion(records, keyField, keep);

  if (dryRun) {
    return NextResponse.json({ mode, groups, toDelete: toDelete.length, sampleGroups, deleted: 0 });
  }

  if (toDelete.length === 0) {
    return NextResponse.json({ mode, groups: 0, deleted: 0, sampleGroups: [] });
  }

  const result = await prisma.collectRecord.deleteMany({
    where: { sourceId: id, id: { in: toDelete } },
  });

  await logActivity({
    workspaceId: source.workspaceId,
    sourceId: source.id,
    userId: user.id,
    action: "records.cleaned",
    meta: { mode, keyField, keep, groups, deleted: result.count },
  });

  return NextResponse.json({ mode, groups, deleted: result.count, sampleGroups });
}
