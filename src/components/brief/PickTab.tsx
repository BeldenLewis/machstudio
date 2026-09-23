"use client";

/**
 * 링크 고르기 — 매주 하는 일이 전부 이 한 화면에서 끝나게 한다.
 *
 *   ① 링크 붙여넣기(여러 줄이면 한꺼번에) → 서버가 제목·기관을 채워 준다
 *   ② 목록에서 채택 토글 · 제목/기관/날짜는 그 자리에서 고친다(칸을 벗어나면 저장)
 *   ③ 오른쪽 카톡 미리보기 — 채택된 것만, 실제로 나갈 글자 그대로 → 복사
 *   ④ 카톡에 올렸으면 "발행" — 이번 호로 묶여 다음 주 글에서 빠진다
 *
 * 편집 값은 전부 보이는 칸이다(접기·모달 없음). 삭제만 작게, 확인 뒤에.
 *
 * 자동 수집 후보(채택 전)는 **읽는 줄**로 보여 준다 — 매일 수십 건이 들어와서, 편집 칸을 다 펼치면
 * 훑을 수가 없다. 토글을 켜는 순간 편집 줄로 바뀐다(고칠 일은 내보낼 때만 생긴다).
 * 후보 숨기기는 위험하지 않아 확인 없이 바로.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown, Copy, ExternalLink, EyeOff, Loader2, Plus, Send, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Btn, Chip, Field, FieldArea, FINISH, R, Segmented } from "@/components/ui/primitives";
import { BRIEF_CATEGORIES, daysUntil, formatMonthDay, type BriefCategory } from "@/lib/brief/model";
import { api, type BriefIssueRow, type BriefItem, type BriefRow } from "./types";

/** 추가 폼의 분류 버튼 — 휴대폰 한 줄에 셋이 들어가게 짧게. */
const SHORT_LABEL: Record<BriefCategory, string> = { support: "지원사업", event: "웨비나·리포트", news: "뉴스" };

const KST_MS = 9 * 3600_000;
/** ISO → date input 값(YYYY-MM-DD, KST) */
function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + KST_MS).toISOString().slice(0, 10);
}

const URL_RE = /https?:\/\/[^\s<>"']+/g;

function extractUrls(text: string): string[] {
  const found = text.match(URL_RE) ?? [];
  return [...new Set(found.map((u) => u.replace(/[),.]+$/, "")))];
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("복사했어요");
    return true;
  } catch {
    toast.error("복사하지 못했어요 — 글자를 직접 선택해 복사해 주세요");
    return false;
  }
}

interface Props {
  brief: BriefRow;
  items: BriefItem[];
  issues: BriefIssueRow[];
  canWrite: boolean;
  setItems: React.Dispatch<React.SetStateAction<BriefItem[]>>;
  reload: () => Promise<void>;
  onOpenSources?: () => void;
}

type Filter = "all" | "adopted" | "candidates";
/** 카테고리마다 처음에 보여 줄 후보 수 — 채택한 건 항상 다 보인다 */
const CANDIDATES_SHOWN = 6;

const isCandidate = (i: BriefItem) => !i.adopted && i.source !== "manual";

export function PickTab({ brief, items, issues, canWrite, setItems, reload, onOpenSources }: Props) {
  const current = items.filter((i) => !i.issueId);
  const adoptedCount = current.filter((i) => i.adopted).length;
  const candidateCount = current.filter(isCandidate).length;
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const visible = current.filter((i) => (filter === "adopted" ? i.adopted : filter === "candidates" ? isCandidate(i) : true));

  const hide = async (id: string) => {
    const prev = items;
    setItems((list) => list.filter((i) => i.id !== id));
    try {
      await api(`/api/briefs/${brief.id}/items/${id}`, { method: "DELETE" });
    } catch (e) {
      setItems(prev);
      toast.error((e as Error).message);
    }
  };

  const patch = async (id: string, data: Record<string, unknown>) => {
    const prev = items;
    setItems((list) => list.map((i) => (i.id === id ? ({ ...i, ...data } as BriefItem) : i)));
    try {
      const res = await api<{ item: BriefItem }>(`/api/briefs/${brief.id}/items/${id}`, { method: "PATCH", body: JSON.stringify(data) });
      setItems((list) => list.map((i) => (i.id === id ? res.item : i)));
    } catch (e) {
      setItems(prev);
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-5">
        {canWrite && (
          <AddLinks
            briefId={brief.id}
            onAdded={(item) => setItems((list) => [item, ...list.filter((i) => i.id !== item.id)])}
          />
        )}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              이번 호 <span className="font-normal text-muted-foreground">채택 {adoptedCount}개</span>
            </h2>
            <div className="flex items-center gap-1">
              <Segmented<Filter>
                label="보기"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: `전체 ${current.length}` },
                  { value: "adopted", label: `채택 ${adoptedCount}` },
                  { value: "candidates", label: `새 후보 ${candidateCount}` },
                ]}
              />
              {onOpenSources && (
                <Btn tone="ghost" className="px-2" onClick={onOpenSources} aria-label="자동 수집 설정" title="자동 수집 설정">
                  <Settings2 className="h-4 w-4" />
                </Btn>
              )}
            </div>
          </div>
          {visible.length === 0 ? (
            <p className={`${R.surface} bg-secondary/50 p-6 text-center text-sm text-muted-foreground`}>
              {current.length === 0
                ? "위에 링크를 붙여넣거나, 자동 수집이 매일 아침 후보를 채워 줘요."
                : filter === "adopted"
                  ? "아직 채택한 링크가 없어요. 후보의 토글을 켜 보세요."
                  : "보여 줄 후보가 없어요."}
            </p>
          ) : (
            BRIEF_CATEGORIES.map((c) => {
              const inCat = visible.filter((i) => i.category === c.key);
              if (inCat.length === 0) return null;
              // 채택한 것·손으로 넣은 것이 위, 후보는 그 아래(서버 정렬 순서 유지)
              const fixed = inCat.filter((i) => !isCandidate(i));
              const cands = inCat.filter(isCandidate);
              const open = expanded[c.key] || filter === "candidates";
              const shownCands = open ? cands : cands.slice(0, CANDIDATES_SHOWN);
              return (
                <div key={c.key} className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {c.emoji} {c.label} <span className="font-normal">{inCat.length}</span>
                  </p>
                  <AnimatePresence initial={false}>
                    {fixed.map((item) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        canWrite={canWrite}
                        briefId={brief.id}
                        onPatch={(d) => patch(item.id, d)}
                        onDeleted={() => setItems((l) => l.filter((i) => i.id !== item.id))}
                      />
                    ))}
                    {shownCands.map((item) => (
                      <CandidateRow
                        key={item.id}
                        item={item}
                        canWrite={canWrite}
                        onAdopt={() => patch(item.id, { adopted: true })}
                        onHide={() => hide(item.id)}
                      />
                    ))}
                  </AnimatePresence>
                  {cands.length > shownCands.length && (
                    <button
                      type="button"
                      onClick={() => setExpanded((e) => ({ ...e, [c.key]: true }))}
                      className={`w-full ${R.control} bg-secondary/50 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground`}
                    >
                      후보 {cands.length - shownCands.length}개 더 보기
                    </button>
                  )}
                </div>
              );
            })
          )}
        </section>

        <SentIssues issues={issues} items={items} />
      </div>

      <KakaoPanel brief={brief} items={current} canWrite={canWrite} onPublished={reload} />
    </div>
  );
}

// ─── 링크 추가 ──────────────────────────────────────────────────────────────

function AddLinks({ briefId, onAdded }: { briefId: string; onAdded: (item: BriefItem) => void }) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState<BriefCategory>("support");
  const [title, setTitle] = useState("");
  const [org, setOrg] = useState("");
  const [due, setDue] = useState("");
  const [label, setLabel] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [adding, setAdding] = useState<{ done: number; total: number } | null>(null);
  const lastPreviewed = useRef("");

  const urls = useMemo(() => extractUrls(text), [text]);
  const single = urls.length === 1;
  const firstUrl = urls[0] ?? "";

  // 링크 하나면 제목·기관을 미리 채워 보여 준다 — 고칠 게 있으면 추가 전에 고친다.
  useEffect(() => {
    if (!single || firstUrl === lastPreviewed.current) return;
    const url = firstUrl;
    lastPreviewed.current = url;
    const t = setTimeout(async () => {
      setPreviewing(true);
      try {
        const res = await api<{ preview: { title: string; siteName: string } | null }>(`/api/briefs/${briefId}/preview`, {
          method: "POST",
          body: JSON.stringify({ url }),
        });
        if (res.preview && lastPreviewed.current === url) {
          setTitle((v) => v || res.preview!.title);
          setOrg((v) => v || res.preview!.siteName);
        }
      } catch {
        /* 못 가져오면 직접 적으면 된다 */
      } finally {
        setPreviewing(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [single, firstUrl, briefId]);

  const reset = () => {
    setText("");
    setTitle("");
    setOrg("");
    setDue("");
    setLabel("");
    lastPreviewed.current = "";
  };

  const add = async () => {
    if (urls.length === 0) return;
    setAdding({ done: 0, total: urls.length });
    let ok = 0;
    let dup = 0;
    for (const [n, url] of urls.entries()) {
      try {
        const dated = category !== "news";
        const body = single
          ? { url, category, title, org, dueDate: dated ? due || null : null, dateLabel: dated ? label : "" }
          : { url, category };
        const res = await api<{ item: BriefItem }>(`/api/briefs/${briefId}/items`, { method: "POST", body: JSON.stringify(body) });
        onAdded(res.item);
        ok++;
      } catch (e) {
        if ((e as { status?: number }).status === 409) dup++;
        else toast.error(`${url.slice(0, 40)}… ${(e as Error).message}`);
      }
      setAdding({ done: n + 1, total: urls.length });
    }
    setAdding(null);
    if (ok) toast.success(`${ok}개 추가했어요${dup ? ` · ${dup}개는 이미 있어요` : ""}`);
    else if (dup) toast.message("이미 들어 있는 링크예요");
    reset();
  };

  return (
    <section className={`${R.panel} ${FINISH.s1} space-y-3 bg-card p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">링크 추가</h2>
        <Segmented<BriefCategory>
          label="분류"
          value={category}
          onChange={setCategory}
          options={BRIEF_CATEGORIES.map((c) => ({ value: c.key, label: `${c.emoji} ${SHORT_LABEL[c.key]}`, hint: c.label }))}
        />
      </div>
      <FieldArea
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          // 다른 링크로 바뀌면 앞 링크의 제목·기관을 비운다 — 엉뚱한 제목이 붙어 저장되지 않게.
          if ((extractUrls(next)[0] ?? "") !== firstUrl) {
            setTitle("");
            setOrg("");
          }
          setText(next);
        }}
        rows={urls.length > 1 ? 4 : 2}
        placeholder={"링크를 붙여넣으세요. 여러 줄이면 한꺼번에 추가돼요.\nhttps://..."}
        className="font-mono text-xs"
      />

      {single && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[160px_minmax(0,1fr)]">
          <Field className="col-span-2 sm:col-span-1" value={org} onChange={(e) => setOrg(e.target.value)} placeholder={category === "news" ? "언론사" : "기관"} aria-label="기관" />
          <div className="relative col-span-2 sm:col-span-1">
            <Field value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목 (비우면 자동으로 채워요)" aria-label="제목" />
            {previewing && <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>
          {category !== "news" && (
            <>
              <Field type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label={category === "support" ? "마감일" : "행사일"} />
              <Field
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={category === "support" ? "날짜 대신 적을 말 (예: 예산소진시까지)" : "날짜 대신 적을 말 (예: 상시)"}
                aria-label="날짜 표기"
              />
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {urls.length > 1 && <span className="text-xs text-muted-foreground">링크 {urls.length}개 — 제목은 각각 자동으로 채워요</span>}
        <Btn tone="key" onClick={add} disabled={urls.length === 0 || adding !== null}>
          {adding ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> {adding.done}/{adding.total}</>
          ) : (
            <><Plus className="h-4 w-4" /> {urls.length > 1 ? `${urls.length}개 추가` : "추가"}</>
          )}
        </Btn>
      </div>
    </section>
  );
}

// ─── 한 줄 ─────────────────────────────────────────────────────────────────

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="채택"
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        on ? "bg-violet-600" : `bg-secondary ${FINISH.s2}`
      }`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
    </button>
  );
}

/** 칸을 벗어날 때 바뀐 게 있으면 저장 — 타이핑마다 요청을 보내지 않는다. */
function InlineField({
  value,
  onSave,
  ...rest
}: { value: string; onSave: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [v, setV] = useState(value);
  // 서버 값이 바뀌면(다른 곳에서 저장·되돌림) 칸도 따라간다 — 렌더 중 조정(React 권장 패턴).
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setV(value);
  }
  return (
    <Field
      {...rest}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v !== value) onSave(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function ItemRow({
  item,
  canWrite,
  briefId,
  onPatch,
  onDeleted,
}: {
  item: BriefItem;
  canWrite: boolean;
  briefId: string;
  onPatch: (d: Record<string, unknown>) => void;
  onDeleted: () => void;
}) {
  const confirm = useConfirm();
  const isNews = item.category === "news";

  // 자동 수집분은 지우지 않고 숨긴다(서버가 행을 남겨 다시 수집되지 않게) — 되돌릴 부담이 없어 확인 없이.
  const isAuto = item.source !== "manual";
  const remove = async () => {
    const ok = isAuto || await confirm({
      title: "이 링크를 지울까요?",
      description: "이미 카톡에 나간 단축 주소는 계속 열려요.",
      confirmLabel: "지우기",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api(`/api/briefs/${briefId}/items/${item.id}`, { method: "DELETE" });
      onDeleted();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.16 }}
      className={`${R.surface} ${FINISH.s1} bg-card p-3 transition-opacity ${item.adopted ? "" : "opacity-60"}`}
    >
      <div className="flex items-start gap-3">
        <div className="pt-1.5">
          <Toggle on={item.adopted} onChange={(adopted) => onPatch({ adopted })} disabled={!canWrite} />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)]">
            <InlineField value={item.org} onSave={(org) => onPatch({ org })} disabled={!canWrite} placeholder={isNews ? "언론사" : "기관"} aria-label="기관" className="text-xs" />
            <InlineField value={item.title} onSave={(title) => title.trim() && onPatch({ title })} disabled={!canWrite} aria-label="제목" className="font-medium" />
          </div>
          {isAuto && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <SourceBadge item={item} />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!isNews && (
              <>
                <div className="w-[150px] shrink-0">
                  <InlineField
                    type="date"
                    value={toDateInput(item.dueDate)}
                    onSave={(v) => onPatch({ dueDate: v || null })}
                    disabled={!canWrite}
                    aria-label={item.category === "support" ? "마감일" : "행사일"}
                    className="text-xs"
                  />
                </div>
                <div className="min-w-[140px] flex-1 sm:max-w-[200px]">
                  <InlineField
                    value={item.dateLabel}
                    onSave={(dateLabel) => onPatch({ dateLabel })}
                    disabled={!canWrite}
                    placeholder="날짜 대신 적을 말"
                    aria-label="날짜 표기"
                    className="text-xs"
                  />
                </div>
              </>
            )}
            <select
              value={item.category}
              disabled={!canWrite}
              onChange={(e) => onPatch({ category: e.target.value })}
              aria-label="분류"
              className={`min-h-9 bg-transparent px-2 text-xs text-muted-foreground ${R.control} ${FINISH.s2}`}
            >
              {BRIEF_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>
              ))}
            </select>
            <div className="ml-auto flex items-center gap-1">
              {item.shortUrl && (
                <Btn tone="ghost" className="px-2 text-xs" onClick={() => copyText(item.shortUrl!)} title={item.shortUrl}>
                  <Copy className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{item.shortUrl.replace(/^https?:\/\//, "")}</span>
                </Btn>
              )}
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex min-h-9 items-center px-2 text-muted-foreground hover:text-foreground ${R.control}`}
                aria-label="원문 열기"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              {canWrite && (
                <Btn
                  tone="dangerQuiet"
                  className="px-2"
                  onClick={remove}
                  aria-label={isAuto ? "숨기기" : "지우기"}
                  title={isAuto ? "숨기기 — 다시 수집되지 않아요" : "지우기"}
                >
                  {isAuto ? <EyeOff className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Btn>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** 자동 수집 후보 — 읽는 줄. 토글을 켜면 채택되고 편집 줄로 바뀐다. */
function CandidateRow({ item, canWrite, onAdopt, onHide }: { item: BriefItem; canWrite: boolean; onAdopt: () => void; onHide: () => void }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.14 }}
      className={`${R.surface} bg-secondary/40 px-3 py-2.5`}
    >
      <div className="flex items-start gap-3">
        <div className="pt-0.5">
          <Toggle on={false} onChange={onAdopt} disabled={!canWrite} />
        </div>
        <div className="min-w-0 flex-1">
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-sm font-medium leading-snug hover:underline">
            {item.title}
          </a>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            {item.org && <span className="max-w-[16rem] truncate">{item.org}</span>}
            <WhenBadge item={item} />
            <SourceBadge item={item} />
          </div>
        </div>
        {canWrite && (
          <Btn tone="ghost" className="shrink-0 px-2" onClick={onHide} aria-label="숨기기" title="숨기기 — 다시 수집되지 않아요">
            <EyeOff className="h-3.5 w-3.5" />
          </Btn>
        )}
      </div>
    </motion.div>
  );
}

function WhenBadge({ item }: { item: BriefItem }) {
  if (item.category === "news") {
    const ago = -daysUntil(item.publishedAt ?? item.createdAt);
    return <span>{ago <= 0 ? "오늘" : `${ago}일 전`}</span>;
  }
  if (item.dateLabel) return <span>{item.dateLabel}</span>;
  if (!item.dueDate) return null;
  const d = daysUntil(item.dueDate);
  return (
    <span className={d <= 3 ? "font-semibold text-amber-700 dark:text-amber-400" : ""}>
      {d === 0 ? "오늘 마감" : `D-${d}`} · ~{formatMonthDay(item.dueDate)}
    </span>
  );
}

const SOURCE_NAMES: Record<string, string> = { bizinfo: "기업마당", googlenews: "Google 뉴스", rss: "RSS", kita: "무역협회" };

function SourceBadge({ item }: { item: BriefItem }) {
  if (item.source === "manual") return null;
  return <Chip className="py-0">자동 · {item.sourceName || SOURCE_NAMES[item.source] || item.source}</Chip>;
}

// ─── 카톡 ──────────────────────────────────────────────────────────────────

function KakaoPanel({
  brief,
  items,
  canWrite,
  onPublished,
}: {
  brief: BriefRow;
  items: BriefItem[];
  canWrite: boolean;
  onPublished: () => Promise<void>;
}) {
  const confirm = useConfirm();
  const [result, setResult] = useState<{ sig: string; text: string; count: number } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState(false);

  // 목록이 바뀌면(채택·제목·날짜) 서버에서 다시 만든다 — 정렬·형식은 서버 한 곳에서만 정한다.
  const signature =
    JSON.stringify(items.map((i) => [i.id, i.adopted, i.title, i.org, i.dueDate, i.dateLabel, i.category, i.shortUrl])) +
    [brief.intro, brief.name, brief.appendPublicLink, brief.slug, brief.isPublic].join("|");
  const text = result?.text ?? "";
  const count = result?.count ?? 0;
  const loading = result?.sig !== signature;
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await api<{ text: string; count: number }>(`/api/briefs/${brief.id}/kakao`);
        if (!cancelled) setResult({ sig: signature, ...res });
      } catch (e) {
        if (!cancelled) toast.error((e as Error).message);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [brief.id, signature]);

  /*
    복사한 김에 발행까지 묻는다 — 발행을 깜빡하면 지난주 링크가 이번 주 글에 그대로 또 들어간다.
    "나중에" 를 눌러도 복사는 이미 됐다. 발행 버튼은 따로 남겨 둔다(복사 없이 발행만 할 때).
  */
  const copy = async () => {
    if (!(await copyText(text))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    if (!canWrite || count === 0) return;
    const ok = await confirm({
      title: "카톡에 올리셨나요?",
      description: `올렸다면 지금 발행해 두세요. 채택한 ${count}개가 이번 호로 묶여 다음 주 글에서 빠지고, 대시보드에서 호별로 집계돼요.`,
      confirmLabel: "발행",
      cancelLabel: "나중에",
    });
    if (ok) await publish({ confirmed: true });
  };

  const publish = async ({ confirmed = false }: { confirmed?: boolean } = {}) => {
    const ok =
      confirmed ||
      (await confirm({
        title: `채택한 ${count}개를 이번 호로 묶을까요?`,
        description: "카톡에 올린 뒤 누르세요. 묶인 링크는 다음 카톡 글에서 빠지고, 대시보드에서 호별로 집계돼요.",
        confirmLabel: "발행",
      }));
    if (!ok) return;
    setPublishing(true);
    try {
      await api(`/api/briefs/${brief.id}/issues`, { method: "POST", body: "{}" });
      toast.success("발행했어요");
      await onPublished();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <aside className="lg:sticky lg:top-4 lg:self-start">
      <div className={`${R.panel} ${FINISH.s1} space-y-3 bg-card p-4`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">카톡에 올릴 글</h2>
          <Chip tone={count ? "key" : "neutral"}>채택 {count}개</Chip>
        </div>
        <div className={`relative max-h-[60vh] overflow-auto ${R.surface} bg-amber-400/10 p-3`}>
          {loading && <Loader2 className="absolute right-2 top-2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {count === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">채택한 링크가 없어요. 목록에서 토글을 켜 주세요.</p>
          ) : (
            <pre className="whitespace-pre-wrap break-all font-sans text-[13px] leading-relaxed">{text}</pre>
          )}
        </div>
        <div className="flex gap-2">
          <Btn tone="key" className="flex-1" onClick={copy} disabled={count === 0}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} 복사
          </Btn>
          {canWrite && (
            <Btn tone="quiet" onClick={() => publish()} disabled={count === 0 || publishing}>
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} 발행
            </Btn>
          )}
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          링크는 단축 주소라 누가 몇 번 눌렀는지 대시보드에서 볼 수 있어요. 복사하면 발행할지 물어봐요 — 발행해야 다음 주 글에서 빠져요.
        </p>
      </div>
    </aside>
  );
}

// ─── 지난 호 ───────────────────────────────────────────────────────────────

function SentIssues({ issues, items }: { issues: BriefIssueRow[]; items: BriefItem[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (issues.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">지난 호</h2>
      {issues.map((iss) => {
        const rows = items.filter((i) => i.issueId === iss.id);
        const isOpen = open === iss.id;
        return (
          <div key={iss.id} className={`${R.surface} bg-secondary/40`}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : iss.id)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm"
              aria-expanded={isOpen}
            >
              <span className="flex-1 truncate">{iss.title}</span>
              <span className="text-xs text-muted-foreground">{iss.itemCount}개</span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <ul className="space-y-1 px-3 pb-3 text-xs">
                {rows.map((i) => (
                  <li key={i.id} className="flex gap-2">
                    <span className="shrink-0 text-muted-foreground">{BRIEF_CATEGORIES.find((c) => c.key === i.category)?.emoji}</span>
                    <a href={i.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate hover:underline">{i.title}</a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
