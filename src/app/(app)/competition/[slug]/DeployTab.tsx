"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { FINISH, R } from "@/components/ui/primitives";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { getPublicAppOrigin } from "@/lib/app-url";
import type { CompetitionDetail } from "./page";

interface Props {
  competition: CompetitionDetail;
  patch: (body: Record<string, unknown>, successMessage?: string) => Promise<boolean>;
}

function CopyRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">{label}</span>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              toast.success("복사했어요");
              setTimeout(() => setCopied(false), 1500);
            } catch {
              toast.error("복사에 실패했어요 — 직접 선택해 복사해주세요");
            }
          }}
          className={`flex items-center gap-1 bg-secondary px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground ${R.control}`}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          복사
        </button>
      </div>
      <pre className={`mt-1.5 overflow-x-auto bg-secondary/40 p-3 text-[11px] leading-relaxed ${R.control}`}>
        <code>{value}</code>
      </pre>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function DeployTab({ competition, patch }: Props) {
  const confirm = useConfirm();
  const origin = getPublicAppOrigin();
  const snippet = `<script async src="${origin}/c/${competition.id}"></script>\n<div data-mach-competition></div>`;
  const voteSnippet = `<script async src="${origin}/c/${competition.id}/vote"></script>\n<div data-mach-competition-vote></div>`;
  const finalVoteSnippet = `<script async src="${origin}/c/${competition.id}/vote?round=final"></script>\n<div data-mach-competition-vote></div>`;
  const resultSnippet = `<script async src="${origin}/c/${competition.id}/result"></script>\n<div data-mach-competition-result></div>`;
  const previewUrl = competition.previewToken ? `${origin}/cp/${competition.previewToken}` : "";

  const rotate = async () => {
    const ok = await confirm({
      title: "미리보기 링크를 새로 만들까요?",
      description: "지금까지 공유한 링크는 즉시 열리지 않게 돼요.",
      confirmLabel: "새로 만들기",
    });
    if (!ok) return;
    await patch({ rotatePreviewToken: true }, "미리보기 링크를 새로 만들었어요");
  };

  return (
    <div className="space-y-4">
      <section className={`bg-background p-5 ${R.panel} ${FINISH.s1}`}>
        <h2 className="text-sm font-semibold">설치 코드</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          아임웹 코드블럭에 이 두 줄을 넣으면 공고 페이지와 신청 팝업이 그대로 나와요.
          machstudio에서 내용을 고치면 최대 30초 안에 반영됩니다.
        </p>
        {/*
          **어느 공고가 나가는지 여기서 알려 준다.** 설치 코드는 그대로인데 공고 탭 스위치가
          꺼져 있으면 예전 블록 빌더 공고가 나간다 — 붙여 놓고 "왜 옛날 게 나오지" 로
          시간을 버리는 자리가 정확히 여기다. 코드를 복사하는 화면에서 짚어 준다.
        */}
        {!competition.config.noticePage?.enabled && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            지금은 <b>예전 공고(블록 빌더)</b>가 나가요. 공고 페이지 탭에서 “이 페이지로 내보내기”를
            켜고 저장해야 새로 만든 페이지가 나갑니다.
          </p>
        )}
        <div className="mt-4">
          <CopyRow
            label="아임웹 코드블럭"
            value={snippet}
            hint="두 번째 줄(div)을 빠뜨려도 스크립트 자리에 자동으로 붙어요."
          />
        </div>
      </section>

      <section className={`bg-background p-5 ${R.panel} ${FINISH.s1}`}>
        <h2 className="text-sm font-semibold">투표 화면 설치 코드</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          투표 탭(또는 별도 페이지)에 넣으세요. <b>노출</b>을 켠 참가작만 보이고, 투표 설정 탭에서 연 뒤에 투표가 됩니다.
        </p>
        <div className="mt-4 space-y-4">
          <CopyRow label="예선 투표" value={voteSnippet} />
          <CopyRow
            label="본선 투표"
            value={finalVoteSnippet}
            hint="본선은 진출 확정된 참가작만 보여줘요."
          />
        </div>
      </section>

      <section className={`bg-background p-5 ${R.panel} ${FINISH.s1}`}>
        <h2 className="text-sm font-semibold">결과 발표 설치 코드</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          미리 붙여 둬도 괜찮아요. <b>시상 · 결과</b> 탭에서 공개하기 전까지는 &quot;준비 중&quot;만 보입니다.
        </p>
        <div className="mt-4">
          <CopyRow
            label="결과 발표"
            value={resultSnippet}
            hint="공개 버튼을 누른 뒤 관람객이 새로고침하면 바로 수상작이 나와요."
          />
        </div>
      </section>

      <section className={`bg-background p-5 ${R.panel} ${FINISH.s1}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">미리보기 링크</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              붙이기 전에 실제 화면으로 확인하고 팀원에게 공유하세요. 여기서 신청해도 <b>저장되지 않아요</b>.
            </p>
          </div>
          <button
            onClick={rotate}
            className={`flex shrink-0 items-center gap-1 bg-secondary px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground ${R.control}`}
          >
            <RefreshCw className="h-3 w-3" />
            새로 만들기
          </button>
        </div>

        {previewUrl ? (
          <div className="mt-4 space-y-3">
            <CopyRow label="링크" value={previewUrl} />
            <div className="flex flex-wrap gap-1.5">
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-1 bg-violet-500 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-violet-600 ${R.control}`}
              >
                <ExternalLink className="h-3 w-3" /> 열기
              </a>
              {(["recruiting", "upcoming", "closed"] as const).map((phase) => (
                <a
                  key={phase}
                  href={`${previewUrl}?phase=${phase}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-1 bg-secondary px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground ${R.control}`}
                >
                  {phase === "recruiting" ? "접수 중" : phase === "upcoming" ? "접수 전" : "마감"} 화면
                </a>
              ))}
              <a
                href={`${previewUrl}?view=result`}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-1 bg-secondary px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground ${R.control}`}
              >
                결과 발표 화면
              </a>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">
            미리보기 링크가 아직 없어요. &quot;새로 만들기&quot;를 눌러 발급하세요.
          </p>
        )}
      </section>
    </div>
  );
}
