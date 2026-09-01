import { EXPO_STANDALONE_RUNTIME_JS } from "@/generated/expo-standalone-runtime";
import { normalizeExpoPage, normalizeExpoTheme } from "@/lib/expo/config";
import { isSafePublicUrl } from "@/lib/expo/destination";
import { hasContent } from "@/lib/expo/model";
import { buildExpoPayload, type LinkTarget } from "@/lib/expo/payload";
import { EXPO_SHELL_CSS } from "@/lib/expo/shell-css";
import { snapshotDigest } from "@/lib/expo/snapshot-digest";
import type {
  ExpoPageConfigV2, ExpoSection, ExpoTheme, FieldIssue, ResolvedDestination, StandaloneExpoRuntimePayload,
} from "@/lib/expo/types";
import { jsonForScript } from "@/lib/script-json";

export type ExpoExportScope = { type: "page" } | { type: "section"; sid: string };

export interface StandaloneExpoInput {
  pageId: string;
  revisionSequence: number | null;
  revisionCodeDigest: string | null;
  exportedAt: Date;
  scope: ExpoExportScope;
  config: ExpoPageConfigV2;
  theme: ExpoTheme;
  locale: string;
  pages: LinkTarget[];
}

export type ExpoExportResult =
  | { ok: true; filename: string; html: string }
  | { ok: false; status: 409 | 422; issues: FieldIssue[] };

const issue = (path: string, code: string, message: string, sid?: string): FieldIssue => ({
  path, code, message, severity: "error", ...(sid ? { sid } : {}),
});

function commentText(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/--/g, "-&#45;");
}

function safeLocale(value: string): string {
  const locale = value.trim();
  return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale) ? locale : "ko";
}

function filenameToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "export";
}

function selectedSections(config: ExpoPageConfigV2, scope: ExpoExportScope): ExpoSection[] | null {
  if (scope.type === "page") return config.sections.filter((section) => section.enabled && hasContent(section));
  const found = config.sections.find((section) => section.sid === scope.sid);
  return found && found.enabled && hasContent(found) ? [found] : null;
}

function mediaIssues(sections: readonly ExpoSection[]): FieldIssue[] {
  const issues: FieldIssue[] = [];
  const walk = (value: unknown, path: string, sid: string): void => {
    if (Array.isArray(value)) {
      value.forEach((child, index) => walk(child, `${path}[${index}]`, sid));
      return;
    }
    if (!value || typeof value !== "object") return;
    const row = value as Record<string, unknown>;
    const media = row.kind === "image" || row.kind === "video";
    if (media) {
      const required = row.kind === "video" ? ["url", "originalUrl"] : ["url"];
      for (const key of required) {
        if (!isSafePublicUrl(row[key])) {
          issues.push(issue(`${path}.${key}`, "standalone-media-public-https", "백업 HTML에는 공개 HTTPS 미디어 주소만 사용할 수 있어요.", sid));
        }
      }
      if (typeof row.originalUrl === "string" && row.originalUrl && !isSafePublicUrl(row.originalUrl)) {
        if (!required.includes("originalUrl")) {
          issues.push(issue(`${path}.originalUrl`, "standalone-media-public-https", "백업 HTML에는 공개 HTTPS 미디어 주소만 사용할 수 있어요.", sid));
        }
      }
    }
    for (const [key, child] of Object.entries(row)) walk(child, `${path}.${key}`, sid);
  };
  sections.forEach((section, index) => walk(section.content, `sections[${index}].content`, section.sid));
  return issues;
}

function standaloneDestinations(rawConfig: ExpoPageConfigV2, normalizedConfig: ExpoPageConfigV2):
  | { ok: true; destinations: ResolvedDestination[] }
  | { ok: false; issues: FieldIssue[] } {
  const rawDestinations = rawConfig.settings?.destinations ?? [];
  const issues: FieldIssue[] = [];
  rawDestinations.forEach((destination, index) => {
    if (!destination.enabled || destination.action.type !== "imweb-modal") return;
    if (!isSafePublicUrl(destination.action.fallbackHref)) {
      issues.push(issue(
        `settings.destinations[${index}].action.fallbackHref`,
        "standalone-modal-fallback-required",
        "아임웹 모달 목적지는 백업 HTML용 공개 HTTPS 대체 주소가 필요해요.",
      ));
    }
  });
  if (issues.length) return { ok: false, issues };
  const destinations = normalizedConfig.settings?.destinations ?? [];
  return {
    ok: true,
    destinations: destinations.filter((destination) => destination.enabled).map((destination) => ({
      id: destination.id,
      label: destination.label,
      action: destination.action.type === "imweb-modal"
        ? { type: "url" as const, href: destination.action.fallbackHref! }
        : destination.action,
      ...(destination.analytics ? { analytics: destination.analytics } : {}),
    })),
  };
}

export function prepareStandaloneExpoHtml(input: StandaloneExpoInput): ExpoExportResult {
  const config = normalizeExpoPage(input.config);
  const canonicalRevision = Number.isSafeInteger(input.revisionSequence)
    && Number(input.revisionSequence) > 0
    && typeof input.revisionCodeDigest === "string"
    && input.revisionCodeDigest === snapshotDigest(config);
  if (!canonicalRevision) {
    return {
      ok: false,
      status: 409,
      issues: [issue("revision", "standalone-republish-required", "신뢰할 수 있는 백업을 만들려면 이 페이지를 한 번 다시 발행해 주세요.")],
    };
  }

  const sections = selectedSections(config, input.scope);
  if (!sections || sections.length === 0) {
    const sid = input.scope.type === "section" ? input.scope.sid : undefined;
    return {
      ok: false,
      status: 422,
      issues: [issue(
        input.scope.type === "section" ? "scope.sid" : "sections",
        "standalone-section-unavailable",
        input.scope.type === "section" ? "선택한 구획은 켜져 있고 내용이 있어야 내보낼 수 있어요." : "내보낼 수 있는 구획이 없어요.",
        sid,
      )],
    };
  }

  const unsupported = sections
    .filter((section) => section.type === "register-form" || section.type === "custom-code")
    .map((section) => issue(
      `sections.${section.sid}`,
      "standalone-unsupported",
      section.type === "register-form"
        ? "사전등록 폼 구획은 백업 HTML로 내보낼 수 없어요."
        : "직접 넣은 코드 구획은 백업 HTML로 내보낼 수 없어요.",
      section.sid,
    ));
  // public 정규화는 위험한 media 객체를 버린다. 그 뒤만 검사하면 잘못된 발행본이
  // 조용히 "이미지 없는 성공"이 되므로, 선택된 sid의 원본 스냅샷을 먼저 검사한다.
  const originalBySid = new Map(input.config.sections.map((section) => [section.sid, section]));
  const unsafeMedia = mediaIssues(sections.map((section) => originalBySid.get(section.sid) ?? section));
  // fallback가 잘못되면 normalizeExpoPage가 destination 전체를 버린다. 그 뒤만 보면
  // "모달이 없으니 성공"이 되므로 발행 스냅샷 원본에서 먼저 검증하고 재작성한다.
  const destinationResult = standaloneDestinations(input.config, config);
  if (!destinationResult.ok) {
    return { ok: false, status: 422, issues: [...unsupported, ...unsafeMedia, ...destinationResult.issues] };
  }
  const validationIssues = [...unsupported, ...unsafeMedia];
  if (validationIssues.length) return { ok: false, status: 422, issues: validationIssues };

  const locale = safeLocale(input.locale);
  const resolved = buildExpoPayload({ ...config, sections }, {
    locale,
    pages: input.pages,
    now: input.exportedAt,
  });
  const theme = normalizeExpoTheme(input.theme);
  const runtimePayload: StandaloneExpoRuntimePayload = {
    pageId: input.pageId,
    ...(input.scope.type === "section" ? { sectionId: input.scope.sid } : {}),
    theme,
    sections: resolved.sections,
    locale,
    campaigns: resolved.campaigns,
    destinations: destinationResult.destinations,
    mode: "standalone",
  };
  const campaigns = resolved.campaigns.map((campaign) => `${campaign.id}:${campaign.active ? "on" : "off"}`).join(",") || "none";
  const metadata = `Mach Expo standalone: pageId=${commentText(input.pageId)} revision=${input.revisionSequence} exportedAt=${input.exportedAt.toISOString()} campaigns=${commentText(campaigns)}`;
  const scopeToken = input.scope.type === "section" ? `section-${filenameToken(input.scope.sid)}` : `page-${filenameToken(input.pageId)}`;
  const filename = `mach-expo-${scopeToken}-r${input.revisionSequence}.html`;
  const html = `<!doctype html>\n<!-- ${metadata} -->\n<html lang="${locale}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta name="robots" content="noindex,nofollow">\n<title>Mach Expo standalone</title>\n<style>${EXPO_SHELL_CSS}</style>\n</head>\n<body>\n<main class="msx-root" data-mach-expo-standalone data-msx-ready="0"></main>\n<script>${EXPO_STANDALONE_RUNTIME_JS}\n__msExpoStandalone.boot(${jsonForScript(runtimePayload)});</script>\n</body>\n</html>\n`;
  return { ok: true, filename, html };
}
