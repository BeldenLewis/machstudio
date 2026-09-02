"use client";

import { Field, FieldSelect, FINISH, R } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/switch";
import type {
  CampaignConfig, CampaignOverride, DestinationAction, DestinationConfig,
  ExpoEventConfig, ExpoPageConfigV2, FieldIssue,
} from "@/lib/expo/types";

export const ANALYTICS_EVENT_ALLOWLIST = ["select_content", "generate_lead"] as const;

export interface ScheduleParts {
  date: string;
  time: string;
  offsetHours: number;
}

const SCHEDULE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(Z|([+-])(\d{2}):(\d{2}))$/;

/** Offset-less values never enter Date: preserve the operator's wall time exactly. */
export function splitScheduleValue(value: string): ScheduleParts {
  const match = SCHEDULE.exec(value);
  if (!match) return { date: "", time: "", offsetHours: 0 };
  if (match[3] === "Z") return { date: match[1], time: match[2], offsetHours: 0 };
  const minutes = Number(match[5]) * 60 + Number(match[6]);
  return { date: match[1], time: match[2], offsetHours: (match[4] === "-" ? -1 : 1) * minutes / 60 };
}

export function joinScheduleValue(date: string, time: string, offsetHours: number): string {
  const totalMinutes = Math.round(Math.abs(Number.isFinite(offsetHours) ? offsetHours : 0) * 60);
  const suffix = totalMinutes === 0
    ? "Z"
    : `${offsetHours < 0 ? "-" : "+"}${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
  return `${date}T${time}${suffix}`;
}

export interface ExpoPageSettingsProps {
  config: ExpoPageConfigV2;
  issues: readonly FieldIssue[];
  canEdit: boolean;
  onChange(config: ExpoPageConfigV2): void;
}

export function ExpoPageSettings({ config, issues, canEdit, onChange }: ExpoPageSettingsProps) {
  const settings = config.settings ?? {};
  const patchSettings = (patch: NonNullable<ExpoPageConfigV2["settings"]>) => onChange({
    ...config,
    settings: { ...settings, ...patch },
  });
  const campaigns = settings.campaigns ?? [];
  const destinations = settings.destinations ?? [];

  return (
    <section aria-labelledby="expo-page-settings-heading" className="space-y-4">
      <h2 id="expo-page-settings-heading" className="text-sm font-semibold">행사·캠페인·목적지 설정</h2>
      {settings.event ? (
        <EventSettings event={settings.event} issues={issues} disabled={!canEdit} onChange={(event) => patchSettings({ event })} />
      ) : (
        <button type="button" disabled={!canEdit} onClick={() => patchSettings({ event: blankEvent() })} className={`min-h-9 px-3 text-xs ${R.control} ${FINISH.control} bg-secondary disabled:opacity-50`}>행사 설정 추가</button>
      )}

      <fieldset disabled={!canEdit} className={`${R.surface} ${FINISH.s2} space-y-3 bg-secondary/40 p-3`}>
        <legend className="px-1 text-xs font-semibold">캠페인</legend>
        {campaigns.map((campaign, index) => (
          <CampaignSettings
            key={`${campaign.id}:${index}`}
            campaign={campaign}
            index={index}
            issues={issues}
            onChange={(next) => patchSettings({ campaigns: campaigns.map((item, itemIndex) => itemIndex === index ? next : item) })}
          />
        ))}
        <button type="button" onClick={() => patchSettings({ campaigns: [...campaigns, blankCampaign(campaigns.length)] })} className="min-h-9 text-xs underline underline-offset-4">캠페인 추가</button>
      </fieldset>

      <fieldset disabled={!canEdit} className={`${R.surface} ${FINISH.s2} space-y-3 bg-secondary/40 p-3`}>
        <legend className="px-1 text-xs font-semibold">목적지</legend>
        {destinations.map((destination, index) => (
          <DestinationSettings
            key={`${destination.id}:${index}`}
            destination={destination}
            index={index}
            issues={issues}
            onChange={(next) => patchSettings({ destinations: destinations.map((item, itemIndex) => itemIndex === index ? next : item) })}
          />
        ))}
        <button type="button" onClick={() => patchSettings({ destinations: [...destinations, blankDestination(destinations.length)] })} className="min-h-9 text-xs underline underline-offset-4">목적지 추가</button>
      </fieldset>
    </section>
  );
}

function blankEvent(): ExpoEventConfig {
  return { edition: 2027, startsAt: "2027-01-01T00:00:00Z", endsAt: "2027-01-02T00:00:00Z", facts: {} };
}
function blankCampaign(index: number): CampaignConfig {
  return { id: `campaign-${index + 1}`, label: "새 캠페인", startsAt: "2027-01-01T00:00:00Z", endsAt: "2027-01-02T00:00:00Z", override: "auto", enabled: false };
}
function blankDestination(index: number): DestinationConfig {
  return { id: `destination-${index + 1}`, label: "새 목적지", action: { type: "url", href: "" }, enabled: false };
}

function EventSettings({ event, issues, disabled, onChange }: { event: ExpoEventConfig; issues: readonly FieldIssue[]; disabled: boolean; onChange(event: ExpoEventConfig): void }) {
  const facts = event.facts ?? {};
  return (
    <fieldset disabled={disabled} className={`${R.surface} ${FINISH.s2} space-y-3 bg-secondary/40 p-3`}>
      <legend className="px-1 text-xs font-semibold">행사</legend>
      <NumberField label="행사 회차" path="settings.event.edition" value={event.edition} min={1} onChange={(edition) => onChange({ ...event, edition })} />
      <IssueList path="settings.event.edition" issues={issues} />
      <ScheduleField label="행사 시작" path="settings.event.startsAt" value={event.startsAt} issues={issues} onChange={(startsAt) => onChange({ ...event, startsAt })} />
      <ScheduleField label="행사 종료" path="settings.event.endsAt" value={event.endsAt} issues={issues} onChange={(endsAt) => onChange({ ...event, endsAt })} />
      <div className="grid gap-2 sm:grid-cols-3">
        {(["companies", "sessions", "booths"] as const).map((key) => (
          <div key={key}>
            <NumberField label={{ companies: "참가기업 수", sessions: "세션 수", booths: "부스 수" }[key]} path={`settings.event.facts.${key}`} value={facts[key] ?? 0} min={0} onChange={(value) => onChange({ ...event, facts: { ...facts, [key]: value } })} />
            <IssueList path={`settings.event.facts.${key}`} issues={issues} />
          </div>
        ))}
      </div>
    </fieldset>
  );
}

function CampaignSettings({ campaign, index, issues, onChange }: { campaign: CampaignConfig; index: number; issues: readonly FieldIssue[]; onChange(campaign: CampaignConfig): void }) {
  const base = `settings.campaigns[${index}]`;
  return (
    <div className={`${R.surface} ${FINISH.s2} space-y-2 bg-background/60 p-2.5`}>
      <div className="grid gap-2 sm:grid-cols-2">
        <TextField label={`${campaign.label} 식별자`} path={`${base}.id`} value={campaign.id} onChange={(id) => onChange({ ...campaign, id })} />
        <TextField label={`${campaign.label} 표시 이름`} path={`${base}.label`} value={campaign.label} onChange={(label) => onChange({ ...campaign, label })} />
      </div>
      <IssueList path={`${base}.id`} issues={issues} /><IssueList path={`${base}.label`} issues={issues} />
      <ScheduleField label={`${campaign.label} 시작`} path={`${base}.startsAt`} value={campaign.startsAt} issues={issues} onChange={(startsAt) => onChange({ ...campaign, startsAt })} />
      <ScheduleField label={`${campaign.label} 종료`} path={`${base}.endsAt`} value={campaign.endsAt} issues={issues} onChange={(endsAt) => onChange({ ...campaign, endsAt })} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-48 text-[11px] text-muted-foreground">
          {campaign.label} 상태 재정의
          <FieldSelect data-field-path={`${base}.override`} aria-label={`${campaign.label} 상태 재정의`} value={campaign.override} onChange={(event) => onChange({ ...campaign, override: event.target.value as CampaignOverride })}>
            <option value="auto">일정에 따름</option><option value="force-on">항상 켬</option><option value="force-off">항상 끔</option>
          </FieldSelect>
        </label>
        <label className="flex min-h-9 items-center gap-2 text-xs"><Switch label={`${campaign.label} 활성`} checked={campaign.enabled} onChange={(enabled) => onChange({ ...campaign, enabled })} /> 활성</label>
      </div>
      <IssueList path={`${base}.override`} issues={issues} />
    </div>
  );
}

function DestinationSettings({ destination, index, issues, onChange }: { destination: DestinationConfig; index: number; issues: readonly FieldIssue[]; onChange(destination: DestinationConfig): void }) {
  const base = `settings.destinations[${index}]`;
  const action = destination.action;
  const switchAction = (type: DestinationAction["type"]) => {
    if (type === "url") onChange({ ...destination, action: { type, href: "" } });
    else if (type === "download") onChange({ ...destination, action: { type, href: "" } });
    else if (type === "anchor") onChange({ ...destination, action: { type, target: "" } });
    else onChange({ ...destination, action: { type, modalId: "" } });
  };
  const patchAction = (patch: Partial<DestinationAction>) => onChange({ ...destination, action: { ...action, ...patch } as DestinationAction });
  return (
    <div className={`${R.surface} ${FINISH.s2} space-y-2 bg-background/60 p-2.5`}>
      <div className="grid gap-2 sm:grid-cols-2">
        <TextField label={`${destination.label} 식별자`} path={`${base}.id`} value={destination.id} onChange={(id) => onChange({ ...destination, id })} />
        <TextField label={`${destination.label} 표시 이름`} path={`${base}.label`} value={destination.label} onChange={(label) => onChange({ ...destination, label })} />
      </div>
      <label className="block text-[11px] text-muted-foreground">
        {destination.label} 동작
        <FieldSelect aria-label={`${destination.label} 동작`} value={action.type} onChange={(event) => switchAction(event.target.value as DestinationAction["type"])}>
          <option value="url">HTTPS 주소</option><option value="anchor">페이지 앵커</option><option value="download">파일 다운로드</option><option value="imweb-modal">아임웹 모달</option>
        </FieldSelect>
      </label>
      {action.type === "url" || action.type === "download" ? <TextField label={`${destination.label} 주소`} path={`${base}.action.href`} value={action.href} onChange={(href) => patchAction({ href })} /> : null}
      {action.type === "url" ? <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={action.newTab === true} onChange={(event) => patchAction({ newTab: event.target.checked })} /> 새 탭에서 열기</label> : null}
      {action.type === "anchor" ? <TextField label={`${destination.label} 앵커`} path={`${base}.action.target`} value={action.target} onChange={(target) => patchAction({ target })} /> : null}
      {action.type === "imweb-modal" ? <><TextField label={`${destination.label} 모달 ID`} path={`${base}.action.modalId`} value={action.modalId} onChange={(modalId) => patchAction({ modalId })} /><TextField label={`${destination.label} 대체 주소`} path={`${base}.action.fallbackHref`} value={action.fallbackHref ?? ""} onChange={(fallbackHref) => patchAction({ fallbackHref: fallbackHref || undefined })} /></> : null}
      <IssueList path={`${base}.action.href`} issues={issues} /><IssueList path={`${base}.action.target`} issues={issues} /><IssueList path={`${base}.action.modalId`} issues={issues} /><IssueList path={`${base}.action.fallbackHref`} issues={issues} />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-[11px] text-muted-foreground">
          {destination.label} 분석 이벤트
          <FieldSelect data-field-path={`${base}.analytics.eventName`} aria-label={`${destination.label} 분석 이벤트`} value={destination.analytics?.eventName ?? ""} onChange={(event) => onChange({ ...destination, analytics: event.target.value ? { eventName: event.target.value, ...(destination.analytics?.contentId ? { contentId: destination.analytics.contentId } : {}) } : undefined })}>
            <option value="">추적 안 함</option>{ANALYTICS_EVENT_ALLOWLIST.map((eventName) => <option key={eventName} value={eventName}>{eventName}</option>)}
          </FieldSelect>
        </label>
        <TextField label={`${destination.label} 분석 콘텐츠 ID`} path={`${base}.analytics.contentId`} value={destination.analytics?.contentId ?? ""} disabled={!destination.analytics} onChange={(contentId) => destination.analytics && onChange({ ...destination, analytics: { ...destination.analytics, contentId: contentId || undefined } })} />
      </div>
      <IssueList path={`${base}.analytics.eventName`} issues={issues} /><IssueList path={`${base}.analytics.contentId`} issues={issues} />
      <label className="flex min-h-9 items-center gap-2 text-xs"><Switch label={`${destination.label} 활성`} checked={destination.enabled} onChange={(enabled) => onChange({ ...destination, enabled })} /> 활성</label>
    </div>
  );
}

function ScheduleField({ label, path, value, issues, onChange }: { label: string; path: string; value: string; issues: readonly FieldIssue[]; onChange(value: string): void }) {
  const parts = splitScheduleValue(value);
  const write = (next: Partial<ScheduleParts>) => onChange(joinScheduleValue(next.date ?? parts.date, next.time ?? parts.time, next.offsetHours ?? parts.offsetHours));
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_110px]">
        <label className="text-[11px] text-muted-foreground">{label} 날짜<Field data-field-path={path} type="date" aria-label={`${label} 날짜`} value={parts.date} onChange={(event) => write({ date: event.target.value })} /></label>
        <label className="text-[11px] text-muted-foreground">{label} 시각<Field type="time" step={1} aria-label={`${label} 시각`} value={parts.time} onChange={(event) => write({ time: event.target.value.length === 5 ? `${event.target.value}:00` : event.target.value })} /></label>
        <label className="text-[11px] text-muted-foreground">UTC 오프셋<Field type="number" min={-14} max={14} step={0.25} aria-label={`${label} UTC 오프셋`} value={parts.offsetHours} onChange={(event) => write({ offsetHours: Number(event.target.value) })} /></label>
      </div>
      <IssueList path={path} issues={issues} />
    </div>
  );
}

function TextField({ label, path, value, disabled, onChange }: { label: string; path?: string; value: string; disabled?: boolean; onChange(value: string): void }) {
  return <label className="block min-w-0 text-[11px] text-muted-foreground">{label}<Field data-field-path={path} aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>;
}
function NumberField({ label, path, value, min, onChange }: { label: string; path?: string; value: number; min: number; onChange(value: number): void }) {
  return <label className="block min-w-0 text-[11px] text-muted-foreground">{label}<Field data-field-path={path} type="number" min={min} step={1} aria-label={label} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}
function IssueList({ path, issues }: { path: string; issues: readonly FieldIssue[] }) {
  const exact = issues.filter((issue) => issue.path === path);
  return exact.map((issue, index) => <p key={`${issue.code}:${index}`} role={issue.severity === "error" ? "alert" : "status"} data-field-path={issue.path} className="mt-1 text-[11px] text-[var(--destructive)]">{issue.message}</p>);
}
