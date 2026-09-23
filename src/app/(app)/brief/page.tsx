"use client";

/**
 * 브리프 — 프로젝트별로 해외진출 소식 링크를 모아 카톡 텍스트·공개 화면으로 내보낸다.
 *
 * 탭 셋:
 *   · 링크 고르기 — 매주 하는 일. 붙여넣기 → 채택 토글 → 카톡 복사 → 발행
 *   · 대시보드   — 내부용. 어떤 링크·종류가 눌렸나(다음 호에 뭘 더 찾을지의 근거)
 *   · 공개 화면  — 참가사가 로그인 없이 보는 /b/{slug} 와 그 설정
 *   · 자동 수집  — 어디서 후보를 긁어올지(기업마당 분야·뉴스 검색어·RSS). 매일 아침 9시에 돈다
 *
 * 기본 탭을 "링크 고르기" 로 둔다 — 매주 들어와서 하는 일이 그것이고, 대시보드는 가끔 본다.
 *
 * 프로젝트에 브리프가 하나도 없을 때:
 *   · 코리아 엑스포 프로젝트 → 해외진출 세트(The Action)를 바로 만들고 첫 수집까지 돌린다
 *   · 그 밖 → 주제 세트를 고르거나 빈 브리프로 시작하는 카드를 보여 준다
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Newspaper, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/contexts/workspace";
import { Btn, FINISH, R, Segmented, FieldSelect } from "@/components/ui/primitives";
import { api, type BriefIssueRow, type BriefItem, type BriefRow } from "@/components/brief/types";
import { PickTab } from "@/components/brief/PickTab";
import { DashboardTab } from "@/components/brief/DashboardTab";
import { PublicTab } from "@/components/brief/PublicTab";
import { SourcesTab } from "@/components/brief/SourcesTab";

type Tab = "pick" | "dashboard" | "public" | "sources";

interface PresetOption { key: string; label: string; description: string; name: string }

export default function BriefPage() {
  const { currentProject } = useWorkspace();
  const projectId = currentProject?.id ?? "";
  if (!projectId) {
    return <div className="p-6 text-sm text-muted-foreground">왼쪽에서 프로젝트를 먼저 골라 주세요.</div>;
  }
  // 프로젝트가 바뀌면 화면 상태를 통째로 새로 — 이전 프로젝트의 브리프가 잠깐이라도 비치지 않게.
  return <BriefWorkspace key={projectId} projectId={projectId} />;
}

function BriefWorkspace({ projectId }: { projectId: string }) {

  const [briefs, setBriefs] = useState<BriefRow[] | null>(null);
  const [presets, setPresets] = useState<PresetOption[]>([]);
  const [creating, setCreating] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const [briefId, setBriefId] = useState("");
  const [tab, setTab] = useState<Tab>("pick");

  const [brief, setBrief] = useState<BriefRow | null>(null);
  const [items, setItems] = useState<BriefItem[]>([]);
  const [issues, setIssues] = useState<BriefIssueRow[]>([]);

  // 프로젝트가 바뀌면 브리프 목록부터
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ canWrite: boolean; briefs: BriefRow[]; suggestedPreset: string | null; presets: PresetOption[] }>(
          `/api/briefs?projectId=${encodeURIComponent(projectId)}`,
        );
        let list = res.briefs;
        const suggested = res.presets.find((p) => p.key === res.suggestedPreset);
        if (list.length === 0 && res.canWrite && suggested) {
          // 코리아 엑스포 — 고를 것 없이 해외진출 세트로 바로. 첫 수집이 서버에서 같이 돈다(몇 초).
          if (!cancelled) setCreating(true);
          const created = await api<{ brief: BriefRow }>("/api/briefs", {
            method: "POST",
            body: JSON.stringify({ projectId, name: suggested.name, slug: "the-action", intro: "이번주 바로 확인해야 할 실용 정보를 보내드립니다!", preset: suggested.key }),
          });
          list = [created.brief];
        }
        if (cancelled) return;
        setCreating(false);
        setPresets(res.presets);
        setCanWrite(res.canWrite);
        setBriefs(list);
        setBriefId((prev) => (list.some((b) => b.id === prev) ? prev : list[0]?.id ?? ""));
      } catch (e) {
        if (!cancelled) {
          setBriefs([]);
          toast.error((e as Error).message);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const fetchDetail = useCallback(
    () => api<{ canWrite: boolean; brief: BriefRow; items: BriefItem[]; issues: BriefIssueRow[] }>(`/api/briefs/${briefId}`),
    [briefId],
  );
  const apply = useCallback((res: Awaited<ReturnType<typeof fetchDetail>>) => {
    setBrief(res.brief);
    setItems(res.items);
    setIssues(res.issues);
    setCanWrite(res.canWrite);
  }, []);
  const reload = useCallback(async () => {
    if (briefId) apply(await fetchDetail());
  }, [briefId, apply, fetchDetail]);

  const create = async (preset: PresetOption | null) => {
    setCreating(true);
    try {
      const created = await api<{ brief: BriefRow }>("/api/briefs", {
        method: "POST",
        body: JSON.stringify(
          preset
            ? { projectId, name: preset.name, intro: "이번주 바로 확인해야 할 실용 정보를 보내드립니다!", preset: preset.key }
            : { projectId, name: "브리프" },
        ),
      });
      setBriefs([created.brief]);
      setBriefId(created.brief.id);
      setTab(preset ? "pick" : "sources");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    if (!briefId) return;
    let cancelled = false;
    fetchDetail()
      .then((res) => { if (!cancelled) apply(res); })
      .catch((e) => toast.error((e as Error).message));
    return () => { cancelled = true; };
  }, [briefId, fetchDetail, apply]);

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Newspaper className="h-5 w-5 text-muted-foreground" aria-hidden />
            브리프
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            지원사업·웨비나·산업 뉴스 링크를 모아 카톡에 올릴 글과 공개 화면을 한 번에 만들어요.
          </p>
        </div>
        {briefs && briefs.length > 1 && (
          <FieldSelect value={briefId} onChange={(e) => setBriefId(e.target.value)} className="w-auto" aria-label="브리프 선택">
            {briefs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </FieldSelect>
        )}
      </div>

      <Segmented<Tab>
        label="브리프 탭"
        value={tab}
        onChange={setTab}
        options={[
          { value: "pick", label: "링크 고르기" },
          { value: "dashboard", label: "대시보드" },
          { value: "public", label: "공개 화면" },
          { value: "sources", label: "자동 수집" },
        ]}
      />

      {!brief ? (
        creating ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> 브리프를 만들고 첫 소식을 모으는 중이에요…
          </div>
        ) : briefs && briefs.length === 0 ? (
          canWrite ? (
            <StartCard presets={presets} onPick={create} />
          ) : (
            <p className="text-sm text-muted-foreground">이 프로젝트에는 아직 브리프가 없어요. 편집 권한이 있는 분이 만들 수 있어요.</p>
          )
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중</div>
        )
      ) : tab === "sources" ? (
        <SourcesTab brief={brief} canWrite={canWrite} onCollected={reload} />
      ) : tab === "pick" ? (
        <PickTab brief={brief} items={items} issues={issues} canWrite={canWrite} setItems={setItems} reload={reload} onOpenSources={() => setTab("sources")} />
      ) : tab === "dashboard" ? (
        <DashboardTab brief={brief} />
      ) : (
        <PublicTab brief={brief} canWrite={canWrite} onChange={setBrief} items={items} />
      )}
    </div>
  );
}

/** 코리아 엑스포가 아닌 프로젝트의 첫 화면 — 주제 세트를 고르거나 빈 브리프로 시작. */
function StartCard({ presets, onPick }: { presets: PresetOption[]; onPick: (p: PresetOption | null) => void }) {
  return (
    <section className={`${R.panel} ${FINISH.s1} max-w-xl space-y-4 bg-card p-5`}>
      <div>
        <h2 className="text-base font-semibold">어떤 소식을 모을까요?</h2>
        <p className="mt-1 text-sm text-muted-foreground">세트를 고르면 수집 소스가 채워지고 첫 소식을 바로 모아 와요. 소스는 나중에 “자동 수집” 탭에서 바꿀 수 있어요.</p>
      </div>
      <div className="space-y-2">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onPick(p)}
            className={`flex w-full items-start gap-3 ${R.surface} ${FINISH.s1} bg-background p-4 text-left transition hover:shadow-md active:scale-[0.99]`}
          >
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{p.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{p.description}</span>
            </span>
          </button>
        ))}
      </div>
      <Btn tone="ghost" onClick={() => onPick(null)}>빈 브리프로 시작 — 소스는 직접 추가</Btn>
    </section>
  );
}
