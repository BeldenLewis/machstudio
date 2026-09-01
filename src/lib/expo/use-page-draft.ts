"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReportAutosave } from "@/components/ui/autosave-scope";
import { attachExpoRowKeys, stripExpoRowKeys } from "@/lib/expo/row-key";
import { usePageAutosave, type ExpoRejection } from "@/lib/expo/use-page-autosave";
import { createExpoPageTransport, type ExpoPageEditorDto, type ExpoPageTransport } from "@/lib/expo/editor-dto";
import type { ExpoPageConfigV2 } from "@/lib/expo/types";

const EMPTY_CONFIG: ExpoPageConfigV2 = { schemaVersion: 2, sections: [] };

export interface ExpoPageDraftState {
  config: ExpoPageConfigV2;
  updateConfig(updater: (current: ExpoPageConfigV2) => ExpoPageConfigV2): void;
  title: string;
  setTitle(value: string): void;
  imwebUrl: string;
  setImwebUrl(value: string): void;
  selectedSid: string | null;
  setSelectedSid(sid: string | null): void;
  loading: boolean;
  error: string | null;
  saveState: "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";
  reloadAfterConflict(): Promise<void>;
  /** 작업공간 조립에 필요한 읽기 전용 메타데이터. 초안의 소유권은 계속 이 훅 하나에 있다. */
  page: ExpoPageEditorDto | null;
  revision: number;
  rejected: ExpoRejection[] | null;
  saveBlocked: boolean;
  retry(): void;
  refreshMetadata(): Promise<void>;
  request: ExpoPageTransport["request"];
}

function editableDto(page: ExpoPageEditorDto): ExpoPageEditorDto {
  return {
    ...page,
    draft: { ...page.draft, sections: attachExpoRowKeys(page.draft.sections) },
  };
}

/** 발행/준비 상태만 새로 읽고, 사용자가 편집 중인 초안은 절대 덮지 않는다. */
function withFreshMetadata(current: ExpoPageEditorDto, fresh: ExpoPageEditorDto): ExpoPageEditorDto {
  return {
    ...current,
    codeDigest: fresh.codeDigest,
    publishedCodeDigest: fresh.publishedCodeDigest,
    hasPublished: fresh.hasPublished,
    publishedAt: fresh.publishedAt,
    liveAt: fresh.liveAt,
    updatedAt: fresh.updatedAt,
    readiness: fresh.readiness,
    snippets: fresh.snippets,
    lastSeenAt: fresh.lastSeenAt,
    lastSeenOrigin: fresh.lastSeenOrigin,
  };
}

export function useExpoPageDraft(
  siteId: string,
  pageId: string,
  transport?: ExpoPageTransport,
): ExpoPageDraftState {
  const activeTransport = useMemo(() => transport ?? createExpoPageTransport(), [transport]);
  /** page/transport 조합마다 새 토큰. await 뒤에는 이 토큰과 mounted 상태를 모두 확인한다. */
  const epoch = useMemo(
    () => ({ transport: activeTransport, pageId, siteId }),
    [activeTransport, pageId, siteId],
  );
  const epochRef = useRef(epoch);
  const mountedRef = useRef(false);
  const [page, setPage] = useState<ExpoPageEditorDto | null>(null);
  const [title, setTitle] = useState("");
  const [imwebUrl, setImwebUrl] = useState("");
  const [config, setConfig] = useState<ExpoPageConfigV2>(EMPTY_CONFIG);
  const [selectedSid, setSelectedSid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => { epochRef.current = epoch; }, [epoch]);
  const isCurrent = useCallback(
    (captured: object) => mountedRef.current && epochRef.current === captured,
    [],
  );

  const install = useCallback((loaded: ExpoPageEditorDto) => {
    if (loaded.id !== pageId || loaded.siteId !== siteId) throw new Error("page-scope");
    const next = editableDto(loaded);
    setPage(next);
    setTitle(next.title);
    setImwebUrl(next.imwebUrl ?? "");
    setConfig(next.draft);
    setRevision(next.draftRevision);
    setSelectedSid((current) =>
      current && next.draft.sections.some((section) => section.sid === current)
        ? current
        : next.draft.sections[0]?.sid ?? null,
    );
    // usePageAutosave 의 기준선을 서버에서 막 읽은 값으로 한 번에 갈아탄다.
    setGeneration((value) => value + 1);
    setError(null);
  }, [pageId, siteId]);

  const load = useCallback(async () => {
    const captured = epoch;
    setLoading(true);
    try {
      const loaded = await activeTransport.load(pageId);
      if (!isCurrent(captured)) return;
      install(loaded);
    } catch {
      if (!isCurrent(captured)) return;
      setError("페이지를 불러오지 못했어요.");
    } finally {
      if (isCurrent(captured)) setLoading(false);
    }
  }, [activeTransport, epoch, install, isCurrent, pageId]);

  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => {
    let active = true;
    const captured = epoch;
    activeTransport.load(pageId).then((loaded) => {
      if (active && isCurrent(captured)) install(loaded);
    }).catch(() => {
      if (active && isCurrent(captured)) setError("페이지를 불러오지 못했어요.");
    }).finally(() => {
      if (active && isCurrent(captured)) setLoading(false);
    });
    return () => { active = false; };
  }, [activeTransport, epoch, install, isCurrent, pageId]);

  const value = useMemo(() => ({ title, imwebUrl, config }), [title, imwebUrl, config]);
  const save = useCallback(async (next: typeof value, draftRevision: number) => {
    const captured = epoch;
    const outcome = await activeTransport.save(pageId, {
      title: next.title,
      imwebUrl: next.imwebUrl,
      draft: { ...next.config, sections: stripExpoRowKeys(next.config.sections) },
      draftRevision,
    });
    if (!isCurrent(captured)) return outcome;
    if (outcome.kind === "saved") {
      setRevision(outcome.revision);
      setPage((current) => current ? {
        ...current,
        title: next.title,
        imwebUrl: next.imwebUrl || null,
        draftRevision: outcome.revision,
        codeDigest: outcome.codeDigest ?? current.codeDigest,
      } : current);
      try {
        const fresh = await activeTransport.load(pageId);
        if (!isCurrent(captured)) return outcome;
        setPage((current) => current ? withFreshMetadata(current, fresh) : current);
      } catch {
        // 저장은 성공했다. 메타 조회 실패 때문에 성공을 실패로 바꾸거나 초안을 지우지 않는다.
      }
    }
    return outcome;
  }, [activeTransport, epoch, isCurrent, pageId]);

  const autosave = usePageAutosave({
    pageId: `${pageId}:${generation}`,
    value,
    initialRevision: revision,
    save,
    enabled: page !== null,
  });
  useReportAutosave(autosave.state, autosave.retry);

  const updateConfig = useCallback((updater: (current: ExpoPageConfigV2) => ExpoPageConfigV2) => {
    setConfig((current) => updater(current));
  }, []);

  const reloadAfterConflict = useCallback(async () => { await loadRef.current(); }, []);

  const refreshMetadata = useCallback(async () => {
    const captured = epoch;
    try {
      const fresh = await activeTransport.load(pageId);
      if (!isCurrent(captured)) return;
      setPage((current) => current ? withFreshMetadata(current, fresh) : current);
    } catch {
      // 내보내기 자체는 끝났다. 메타 새로고침 실패가 로컬 초안을 지우거나 막지 않는다.
    }
  }, [activeTransport, epoch, isCurrent, pageId]);

  const saveState: ExpoPageDraftState["saveState"] = autosave.conflict ? "conflict"
    : autosave.state === "saving" ? "saving"
      : autosave.state === "error" ? "error"
        : autosave.dirty ? "dirty"
          : autosave.state;
  const saveBlocked = autosave.dirty || autosave.conflict !== null || autosave.state === "error";

  return {
    config, updateConfig, title, setTitle, imwebUrl, setImwebUrl, selectedSid, setSelectedSid,
    loading, error, saveState, reloadAfterConflict, page, revision, rejected: autosave.rejected,
    saveBlocked, retry: autosave.retry, refreshMetadata, request: activeTransport.request,
  };
}
