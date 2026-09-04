import { createHmac, timingSafeEqual } from "node:crypto";
import { decryptMetaToken, encryptMetaToken } from "@/lib/meta-ads";

export const GOOGLE_ADS_API_VERSION = "v25";
export const googleCustomerId = (value: string) => value.replace(/\D/g, "");
export const encryptGoogleToken = encryptMetaToken;
export const decryptGoogleToken = decryptMetaToken;

function stateSecret() {
  const value = process.env.GOOGLE_ADS_CLIENT_SECRET?.trim();
  if (!value) throw new Error("GOOGLE_ADS_CLIENT_SECRET이 설정되지 않았습니다.");
  return value;
}
export function signGoogleState(payload: object) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${createHmac("sha256", stateSecret()).update(encoded).digest("base64url")}`;
}
export function verifyGoogleState<T>(state: string): T | null {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return null;
  const expected = createHmac("sha256", stateSecret()).update(encoded).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try { return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T; } catch { return null; }
}
export async function googleAccessToken(refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.GOOGLE_ADS_CLIENT_ID || "", client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET || "", refresh_token: refreshToken, grant_type: "refresh_token" }), cache: "no-store" });
  const data = await response.json() as { access_token?: string; error_description?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description || "Google 액세스 토큰을 갱신하지 못했습니다.");
  return data.access_token;
}
export async function googleAdsRequest<T>(path: string, accessToken: string, init?: RequestInit) {
  const response = await fetch(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/${path}`, { ...init, headers: { Authorization: `Bearer ${accessToken}`, "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "", "login-customer-id": googleCustomerId(process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID || ""), "Content-Type": "application/json", ...(init?.headers || {}) }, cache: "no-store" });
  const data = await response.json().catch(() => null) as (T & { error?: { message?: string; details?: Array<{ errors?: Array<{ message?: string; errorCode?: Record<string, string> }> }> } }) | null;
  if (!response.ok || !data) {
    const detail = data?.error?.details?.flatMap((item) => item.errors ?? []).find((item) => item.message);
    const code = detail?.errorCode ? Object.values(detail.errorCode)[0] : undefined;
    throw new Error([code, detail?.message || data?.error?.message || `Google Ads API 요청 실패 (${response.status})`].filter(Boolean).join(": "));
  }
  return data;
}
