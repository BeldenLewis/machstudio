"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { Field, FIELD_CLS, FINISH, R } from "@/components/ui/primitives";
import { ExpoPublishPanel } from "@/components/expo/ExpoPublishPanel";
import { ExpoSectionTree, expoSectionTitle } from "@/components/expo/ExpoSectionTree";
import { SelectedSectionEditor } from "@/components/expo/SectionEditor";
import { useExpoPageDraft, type ExpoPageDraftState } from "@/lib/expo/use-page-draft";
import type { ExpoPageTransport } from "@/lib/expo/editor-dto";
import type { ExpoPermissions } from "@/lib/expo/permissions";
import { sectionDef } from "@/lib/expo/registry";
import type { ExpoSection } from "@/lib/expo/types";

export interface PageDraftWorkspaceProps {
  siteId: string;
  pageId: string;
  permissions: ExpoPermissions;
  transport?: ExpoPageTransport;
  sources?: readonly { id: string; name: string; isActive: boolean }[];
  pages?: readonly { id: string; title: string }[];
  locale?: string;
  embedLocked?: boolean;
  leftTop?: ReactNode;
  leftBottom?: ReactNode;
  renderPreview?: (state: ExpoPageDraftState) => ReactNode;
  onSaved?: () => void;
}

function readLocalized(value: unknown, locale: string): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  for (const key of [locale, "ko", "en", ...Object.keys(record)]) {
    const text = record[key];
    if (typeof text === "string") return text;
  }
  return "";
}

function titleField(section: ExpoSection, defaultLocale: string): { key: string; locale: string; value: string } | null {
  const candidates = ["heading", "title", "headline", "accessibleHeadline"];
  const existing = candidates.find((key) => {
    const raw = section.content[key];
    return typeof raw === "string" || Boolean(raw && typeof raw === "object" && !Array.isArray(raw));
  });
  const slot = sectionDef(section.type)?.slots.find((candidate) =>
    candidates.includes(candidate.key) && (candidate.kind === "text" || candidate.kind === "textarea"),
  );
  const key = existing ?? slot?.key;
  if (!key) return null;
  const raw = section.content[key];
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const map = raw as Record<string, unknown>;
    const locale = [defaultLocale, "ko", "en", ...Object.keys(map)]
      .find((candidate) => typeof map[candidate] === "string") ?? defaultLocale;
    return { key, locale, value: readLocalized(raw, locale) };
  }
  return { key, locale: defaultLocale, value: "" };
}

function LocalDraftPreview({
  sections, selectedSid, onSelect,
}: { sections: ExpoSection[]; selectedSid: string | null; onSelect(sid: string): void }) {
  return (
    <aside
      className={`${R.panel} ${FINISH.s1} space-y-2 bg-card p-3`}
      aria-label="미리보기"
      data-testid="expo-preview"
      data-selected-sid={selectedSid ?? ""}
    >
      <h2 className="text-sm font-semibold">미리보기</h2>
      <div className="space-y-1.5">
        {sections.filter((section) => section.enabled).map((section) => (
          <button
            key={section.sid}
            type="button"
            onClick={() => onSelect(section.sid)}
            aria-label={`${expoSectionTitle(section)} 미리보기에서 선택`}
            className={`block w-full ${R.surface} ${FINISH.s2} bg-secondary px-3 py-5 text-left text-sm ${selectedSid === section.sid ? "ring-2 ring-ring" : ""}`}
          >
            {expoSectionTitle(section)}
          </button>
        ))}
      </div>
    </aside>
  );
}

export function PageDraftWorkspace({
  siteId, pageId, permissions, transport, sources = [], pages = [], locale = "ko", embedLocked = false,
  leftTop, leftBottom, renderPreview, onSaved,
}: PageDraftWorkspaceProps) {
  const state = useExpoPageDraft(siteId, pageId, transport);
  const previousSaveState = useRef(state.saveState);
  useEffect(() => {
    if (state.saveState === "saved" && previousSaveState.current !== "saved") onSaved?.();
    previousSaveState.current = state.saveState;
  }, [onSaved, state.saveState]);
  const selected = state.config.sections.find((section) => section.sid === state.selectedSid) ?? null;
  const allIssues = useMemo(() => state.page ? [
    ...state.page.readiness.publishIssues,
    ...state.page.readiness.liveIssues,
    ...state.page.readiness.notes,
  ] : [], [state.page]);

  if (state.loading && !state.page) {
    return <p className="py-12 text-sm text-muted-foreground">미리보기를 준비하는 중이에요.</p>;
  }
  if (!state.page) {
    return <p className="py-12 text-sm">{state.error ?? "페이지를 불러오지 못했어요."}</p>;
  }

  const replaceSection = (next: ExpoSection) => state.updateConfig((current) => ({
    ...current,
    sections: current.sections.map((section) => section.sid === next.sid ? next : section),
  }));
  const removeSelected = () => {
    const index = state.config.sections.findIndex((section) => section.sid === state.selectedSid);
    const sections = state.config.sections.filter((section) => section.sid !== state.selectedSid);
    state.setSelectedSid((sections[index] ?? sections[index - 1] ?? null)?.sid ?? null);
    state.updateConfig((current) => ({ ...current, sections }));
  };
  const heading = selected ? titleField(selected, locale) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(200px,240px)_minmax(0,1fr)_minmax(280px,380px)]">
      <div className="space-y-3">
        {leftTop}
        <ExpoSectionTree
          sections={state.config.sections}
          selectedSid={state.selectedSid}
          onSelect={state.setSelectedSid}
          onChange={(sections) => state.updateConfig((current) => ({ ...current, sections }))}
          canEdit={permissions.canEdit}
          issues={allIssues}
        />
        {leftBottom}
      </div>

      <main className={`${R.panel} ${FINISH.s1} space-y-5 bg-card p-5`}>
        {state.saveState === "conflict" ? (
          <div className={`${R.surface} ${FINISH.s2Danger} bg-secondary p-3 text-sm`}>
            <p className="font-medium">다른 팀원이 먼저 저장했어요</p>
            <p className="mt-1 text-muted-foreground">자동저장을 멈췄고 이 화면의 내용은 그대로 두었어요.</p>
            <button
              type="button"
              onClick={() => void state.reloadAfterConflict()}
              className="mt-2 text-xs font-medium underline underline-offset-4"
            >
              최신 내용 다시 불러오기
            </button>
          </div>
        ) : null}

        {state.rejected ? (
          <div className={`${R.surface} ${FINISH.s2Danger} bg-secondary p-3 text-sm`}>
            <p className="font-medium">저장하지 못했어요. 아래를 고치면 다시 저장돼요.</p>
            <ul className="mt-1.5 space-y-1 text-muted-foreground">
              {state.rejected.map((issue, index) => <li key={`${issue.path}:${index}`}>{issue.message}</li>)}
            </ul>
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2" aria-label="페이지 설정">
          <label className="block">
            <span className="text-sm font-medium">페이지 제목</span>
            <Field
              value={state.title}
              onChange={(event) => state.setTitle(event.target.value)}
              disabled={!permissions.canEdit}
              maxLength={120}
              aria-label="페이지 제목"
              className={`mt-1.5 ${FIELD_CLS}`}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">아임웹 주소</span>
            <Field
              value={state.imwebUrl}
              onChange={(event) => state.setImwebUrl(event.target.value)}
              disabled={!permissions.canEdit}
              placeholder="https://…"
              aria-label="아임웹 주소"
              className={`mt-1.5 ${FIELD_CLS}`}
            />
          </label>
        </section>

        {selected ? (
          <section className="space-y-3" aria-label={`${expoSectionTitle(selected)} 편집기`}>
            {heading ? <label className="block">
              <span className="text-sm font-medium">섹션 제목</span>
              <Field
                value={heading.value}
                onChange={(event) => replaceSection({
                  ...selected,
                  content: {
                    ...selected.content,
                    [heading.key]: {
                      ...(selected.content[heading.key] && typeof selected.content[heading.key] === "object"
                        ? selected.content[heading.key] as Record<string, unknown>
                        : {}),
                      [heading.locale]: event.target.value,
                    },
                  },
                })}
                disabled={!permissions.canEdit}
                aria-label="섹션 제목"
                className={FIELD_CLS}
              />
            </label> : null}
            <SelectedSectionEditor
              section={selected}
              onChange={replaceSection}
              onRemove={removeSelected}
              canEdit={permissions.canEdit}
              embedLocked={embedLocked}
              siteId={siteId}
              sources={sources}
              pages={pages}
              locale={locale}
            />
          </section>
        ) : (
          <p className="py-8 text-sm text-muted-foreground">왼쪽에서 구획을 골라 주세요.</p>
        )}
      </main>

      <div className="space-y-3">
        {renderPreview?.(state) ?? (
          <LocalDraftPreview
            sections={state.config.sections}
            selectedSid={state.selectedSid}
            onSelect={state.setSelectedSid}
          />
        )}
        <ConfirmProvider>
          <ExpoPublishPanel
            pageId={pageId}
            pageTitle={state.title}
            hasPublished={state.page.hasPublished}
            liveAt={state.page.liveAt}
            readiness={state.page.readiness}
            snippets={state.page.snippets}
            canPublish={permissions.canPublish}
            saveBlocked={state.saveBlocked}
            launchLocked={embedLocked}
            request={state.request}
            onChanged={() => void state.refreshMetadata()}
          />
        </ConfirmProvider>
      </div>
    </div>
  );
}
