import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION?.trim() || "v25.0";

export const META_METRICS = [
  { key: "spend", label: "지출", defaultOn: true },
  { key: "impressions", label: "노출", defaultOn: true },
  { key: "reach", label: "도달", defaultOn: true },
  { key: "frequency", label: "빈도", defaultOn: true },
  { key: "cpm", label: "CPM", defaultOn: true },
  { key: "outbound_clicks", label: "아웃바운드 클릭", defaultOn: true },
  { key: "inline_link_clicks", label: "링크 클릭", defaultOn: true },
  { key: "cpc", label: "CPC", defaultOn: true },
  { key: "ctr", label: "CTR", defaultOn: true },
  { key: "actions", label: "전환·행동", defaultOn: true },
  { key: "cost_per_action_type", label: "CPA", defaultOn: true },
  { key: "conversion_rate", label: "CVR", defaultOn: true },
  { key: "action_values", label: "전환 가치", defaultOn: true },
  { key: "purchase_roas", label: "구매 ROAS", defaultOn: true },
  { key: "website_purchase_roas", label: "웹 구매 ROAS", defaultOn: true },
  { key: "video_play_actions", label: "영상 재생", defaultOn: false },
  { key: "video_p25_watched_actions", label: "영상 25%", defaultOn: false },
  { key: "video_p50_watched_actions", label: "영상 50%", defaultOn: false },
  { key: "video_p75_watched_actions", label: "영상 75%", defaultOn: false },
  { key: "video_p100_watched_actions", label: "영상 100%", defaultOn: false },
] as const;

export const DEFAULT_META_METRICS = META_METRICS.filter((metric) => metric.defaultOn).map((metric) => metric.key);

function secretKey() {
  const raw = process.env.META_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("META_TOKEN_ENCRYPTION_KEY가 설정되지 않았습니다.");
  return createHash("sha256").update(raw).digest();
}

export function encryptMetaToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptMetaToken(value: string) {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !encrypted) throw new Error("Meta 토큰 형식이 올바르지 않습니다.");
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function signMetaState(payload: object) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const secret = process.env.META_APP_SECRET?.trim();
  if (!secret) throw new Error("META_APP_SECRET이 설정되지 않았습니다.");
  return `${encoded}.${createHmac("sha256", secret).update(encoded).digest("base64url")}`;
}

export function verifyMetaState<T>(state: string): T | null {
  const [encoded, signature] = state.split(".");
  const secret = process.env.META_APP_SECRET?.trim();
  if (!encoded || !signature || !secret) return null;
  const expected = createHmac("sha256", secret).update(encoded).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try { return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T; } catch { return null; }
}

export async function metaGraph<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const data = await response.json().catch(() => null) as (T & { error?: { message?: string } }) | null;
  if (!response.ok || !data) throw new Error(data?.error?.message || `Meta API 요청 실패 (${response.status})`);
  return data;
}

export function metricValue(value: unknown, actionType?: string) {
  if (typeof value === "string" || typeof value === "number") return Number(value) || 0;
  if (!Array.isArray(value)) return 0;
  const rows = value as Array<{ action_type?: string; value?: string }>;
  const picked = actionType ? rows.find((row) => row.action_type === actionType) : rows[0];
  return Number(picked?.value) || 0;
}
