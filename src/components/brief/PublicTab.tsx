"use client";

/**
 * 공개 화면 — 참가사가 로그인 없이 보는 /b/{slug} 의 설정과 미리보기.
 *
 * 고치는 영역(왼쪽 설정)과 읽는 영역(오른쪽 휴대폰 폭 미리보기)을 나란히 둔다.
 * 설정은 칸을 벗어나면 바로 저장되고, 미리보기는 저장 뒤 새로 고친다.
 */
import { useRef, useState } from "react";
import { Copy, ExternalLink, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Btn, Field, FieldArea, FINISH, R } from "@/components/ui/primitives";
import { toSlug } from "@/lib/brief/model";
import { api, type BriefItem, type BriefRow } from "./types";

function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${on ? "bg-violet-600" : `bg-secondary ${FINISH.s2}`}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
    </button>
  );
}

export function PublicTab({ brief, canWrite, onChange, items }: { brief: BriefRow; canWrite: boolean; onChange: (b: BriefRow) => void; items: BriefItem[] }) {
  const [name, setName] = useState(brief.name);
  const [intro, setIntro] = useState(brief.intro);
  const [slug, setSlug] = useState(brief.slug);
  const [slugError, setSlugError] = useState("");
  const [frameKey, setFrameKey] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // 저장된 값이 바뀌면 칸도 따라간다 — 렌더 중 조정.
  const [seen, setSeen] = useState(brief);
  if (seen !== brief) {
    setSeen(brief);
    setName(brief.name);
    setIntro(brief.intro);
    setSlug(brief.slug);
  }

  // 채택·제목이 바뀌면 미리보기도 새로 — iframe 키에 섞는다.
  const adoptedSig = items.filter((i) => i.adopted).map((i) => i.id + i.title).join("|");

  const save = async (data: Partial<BriefRow>) => {
    try {
      const res = await api<{ brief: BriefRow }>(`/api/briefs/${brief.id}`, { method: "PATCH", body: JSON.stringify(data) });
      onChange(res.brief);
      setSlugError("");
      setFrameKey((k) => k + 1);
    } catch (e) {
      if ("slug" in data) setSlugError((e as Error).message);
      else toast.error((e as Error).message);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(brief.publicUrl);
      toast.success("주소를 복사했어요");
    } catch {
      toast.error("복사하지 못했어요");
    }
  };

  // 미리보기는 같은 출처의 /b/ 로 연다 — 운영 공개 주소가 아직 설정 전인 로컬에서도 보이게.
  const previewPath = `/b/${brief.slug}`;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0 space-y-4">
        <section className={`${R.panel} ${FINISH.s1} space-y-4 bg-card p-4`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">공개</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">끄면 주소로 들어와도 “찾을 수 없음”이 떠요.</p>
            </div>
            <Switch label="공개" on={brief.isPublic} disabled={!canWrite} onChange={(isPublic) => save({ isPublic })} />
          </div>

          <div className={`flex items-center gap-2 ${R.control} bg-secondary/60 p-2`}>
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{brief.publicUrl || previewPath}</span>
            <Btn tone="ghost" className="px-2" onClick={copy} aria-label="주소 복사" disabled={!brief.publicUrl}><Copy className="h-4 w-4" /></Btn>
            <a href={previewPath} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-9 items-center px-2 text-muted-foreground hover:text-foreground ${R.control}`} aria-label="새 창으로 열기">
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">이름</span>
            <Field value={name} disabled={!canWrite} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== brief.name && save({ name })} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">소개 한 줄 (카톡 글 둘째 줄에도 들어가요)</span>
            <FieldArea rows={2} value={intro} disabled={!canWrite} onChange={(e) => setIntro(e.target.value)} onBlur={() => intro !== brief.intro && save({ intro })} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">주소 끝부분</span>
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 font-mono text-xs text-muted-foreground">/b/</span>
              <Field
                value={slug}
                disabled={!canWrite}
                invalid={!!slugError}
                onChange={(e) => { setSlug(toSlug(e.target.value) || e.target.value.toLowerCase()); setSlugError(""); }}
                onBlur={() => slug !== brief.slug && save({ slug })}
                className="font-mono"
              />
            </div>
            {slugError ? (
              <p className="text-xs text-destructive">{slugError}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">바꾸면 예전 주소는 열리지 않아요. 이미 카톡에 나간 적이 있으면 그대로 두세요.</p>
            )}
          </label>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">카톡 글 끝에 “한눈에 보기” 주소 붙이기</p>
              <p className="mt-0.5 text-xs text-muted-foreground">받은 사람이 지난 소식까지 이 화면에서 모아 볼 수 있어요.</p>
            </div>
            <Switch label="한눈에 보기 붙이기" on={brief.appendPublicLink} disabled={!canWrite} onChange={(appendPublicLink) => save({ appendPublicLink })} />
          </div>
        </section>
        <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
          공개 화면에는 채택한 링크 중 아직 유효한 것만 보여요 — 마감이 지난 지원사업, 30일 지난 뉴스는 자동으로 내려가요. 클릭 수는 보이지 않아요.
        </p>
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">휴대폰 미리보기</span>
          <Btn tone="ghost" className="px-2 text-xs" onClick={() => setFrameKey((k) => k + 1)}><RotateCw className="h-3.5 w-3.5" /> 새로고침</Btn>
        </div>
        <div className={`mx-auto w-full max-w-[390px] overflow-hidden ${R.panel} ${FINISH.s1} bg-neutral-50`}>
          {brief.isPublic ? (
            <iframe key={`${frameKey}-${adoptedSig}`} ref={frameRef} src={previewPath} title="공개 화면 미리보기" className="h-[680px] w-full border-0" />
          ) : (
            <div className="grid h-[300px] place-items-center p-6 text-center text-sm text-muted-foreground">비공개 상태예요. 공개를 켜면 미리보기가 보여요.</div>
          )}
        </div>
      </div>
    </div>
  );
}
