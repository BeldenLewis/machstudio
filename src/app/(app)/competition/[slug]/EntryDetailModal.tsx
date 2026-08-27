"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, X } from "lucide-react";
import { FINISH, R } from "@/components/ui/primitives";
import { formatKst } from "@/lib/datetime";
import { normalizeMedia, youtubeThumbnailUrl } from "@/lib/competition-config";
import type { CompetitionFormField } from "@/lib/competition-config";
import type { CompetitionDetail } from "./page";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

interface Entry {
  id: string;
  entryNo: string;
  title: string;
  teamName: string | null;
  summary: string | null;
  media: unknown;
  data: unknown;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: string;
  agreePrivacy: boolean;
  agreeMarketing: boolean;
  agreeThirdParty: boolean;
  submittedAt: string;
}

function dataValue(data: unknown, key: string): unknown {
  if (!data || typeof data !== "object") return undefined;
  return (data as Record<string, unknown>)[key];
}

/** 값 하나를 표시용 텍스트로 — checkbox 는 "동의"/빈 값으로 저장돼 있다(entries/route.ts §submit). */
function displayValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

const ROW_CLS = "grid grid-cols-[120px_1fr] gap-3 items-start";
const ROW_LABEL_CLS = "pt-1.5 text-xs text-muted-foreground";
const ROW_VALUE_CLS = "whitespace-pre-wrap break-words py-1.5 text-sm";
const EMPTY = <span className="text-muted-foreground/60 italic">비어있음</span>;

/**
 * 참가작 상세 — 신청 폼에 뭘 채워 냈는지 전부 보여준다.
 *
 * 목록 줄에는 제목·팀명·연락처 몇 가지만 보인다 — 운영자가 실제로 확인해야 하는 건
 * "이 팀이 신청 폼에 뭐라고 적었는가" 전체다(반복 항목의 팀원 명단, 커스텀 항목 답변 등).
 * 그 자리가 아예 없었다 — 여기서 신청 폼 항목(config.form.fields) 순서 그대로 값을 맞춰 보여준다.
 * /collect 레코드 상세(RecordDetailModal)와 같은 구조.
 */
export default function EntryDetailModal({
  competition,
  entry,
  onClose,
}: {
  competition: CompetitionDetail;
  entry: Entry;
  onClose: () => void;
}) {
  const fields = competition.config.form.fields;
  const systemFields = fields.filter((f) => f.system && f.enabled);
  const extraFields = fields.filter(
    (f) => f.enabled && !f.system && f.type !== "image" && f.type !== "youtube" && f.type !== "repeater",
  );
  const repeaterFields = fields.filter((f) => f.enabled && f.type === "repeater");
  const media = normalizeMedia(entry.media);
  const images = media.filter((m) => m.kind === "image");
  const video = media.find((m) => m.kind === "youtube");

  const fieldRow = (field: CompetitionFormField) => {
    const raw = dataValue(entry.data, field.key);
    const text = displayValue(raw);
    return (
      <div key={field.id} className={ROW_CLS}>
        <div className={ROW_LABEL_CLS}>{field.label}</div>
        <div className={ROW_VALUE_CLS}>{text || EMPTY}</div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={spring}
          className={`flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden bg-background ${R.panel} ${FINISH.s1}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">
                {entry.entryNo}번 · {entry.title}
              </h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{formatKst(entry.submittedAt)} 접수</p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary"
              aria-label="닫기"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {images.map((img, i) =>
                  img.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={img.url}
                      alt=""
                      title={img.role === "logo" ? "로고" : undefined}
                      className={`h-20 w-20 rounded-lg object-cover ${img.role === "logo" ? "ring-2 ring-violet-400" : ""}`}
                    />
                  ) : null,
                )}
              </div>
            )}
            {video?.kind === "youtube" && (
              <a
                href={`https://www.youtube.com/watch?v=${video.videoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-fit items-center gap-2 rounded-lg bg-secondary px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={youtubeThumbnailUrl(video.videoId)} alt="" className="h-8 w-14 rounded object-cover" />
                영상 보기 <ExternalLink className="h-3 w-3" />
              </a>
            )}

            <div className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">기본 정보</p>
              {systemFields.map(fieldRow)}
            </div>

            {extraFields.length > 0 && (
              <div className="space-y-1.5 border-t border-border pt-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">추가 항목</p>
                {extraFields.map(fieldRow)}
              </div>
            )}

            {repeaterFields.map((field) => {
              const items = dataValue(entry.data, field.key);
              const rows = Array.isArray(items) ? (items as Record<string, string>[]) : [];
              return (
                <div key={field.id} className="space-y-1.5 border-t border-border pt-4">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {field.label} ({rows.length}명)
                  </p>
                  {rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{EMPTY}</p>
                  ) : (
                    <div className="space-y-2">
                      {rows.map((row, i) => (
                        <div key={i} className={`bg-secondary/30 p-2.5 ${R.control}`}>
                          <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{field.label} {i + 1}</p>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                            {(field.subFields ?? []).map((sf) => (
                              <div key={sf.key} className="text-xs">
                                <span className="text-muted-foreground">{sf.label}: </span>
                                <span>{row[sf.key] || EMPTY}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="space-y-1.5 border-t border-border pt-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">동의</p>
              <div className={ROW_CLS}>
                <div className={ROW_LABEL_CLS}>개인정보 수집·이용</div>
                <div className={ROW_VALUE_CLS}>{entry.agreePrivacy ? "동의" : "미동의"}</div>
              </div>
              <div className={ROW_CLS}>
                <div className={ROW_LABEL_CLS}>마케팅 수신</div>
                <div className={ROW_VALUE_CLS}>{entry.agreeMarketing ? "동의" : "미동의"}</div>
              </div>
              {competition.config.form.thirdPartyEnabled && (
                <div className={ROW_CLS}>
                  <div className={ROW_LABEL_CLS}>제3자 제공</div>
                  <div className={ROW_VALUE_CLS}>{entry.agreeThirdParty ? "동의" : "미동의"}</div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
