/**
 * GA4 Admin API로 서비스 계정이 접근 가능한 속성 목록을 조회한다.
 *
 * 지금까지는 ProjectAnalyticsSettingsModal에서 9자리 속성 ID를 손으로 입력했다 —
 * 오타가 나도 조용히 실패한다(getGa4ActiveUsers가 null을 흡수해 퍼널만 안 보임).
 * 여기서 실제 접근 가능한 속성을 불러와 고르게 하면 그 실패 경로 자체가 없어진다.
 *
 * google-auth-library는 @google-analytics/data(google-gax)의 기존 의존성이라 새 패키지가
 * 아니다 — 여기서는 Admin API에 대한 REST 호출용으로 직접 가져다 쓴다(Admin API 전용 SDK는 없음).
 */
import { GoogleAuth } from "google-auth-library";

export interface Ga4PropertyOption {
  propertyId: string;
  displayName: string;
  accountDisplayName: string;
}

interface Ga4AccountsResponse {
  accounts?: Array<{ name: string; displayName: string }>;
}

interface Ga4PropertiesResponse {
  properties?: Array<{ name: string; displayName: string }>;
}

let cachedAuth: GoogleAuth | null | undefined;

function getAuth(): GoogleAuth | null {
  if (cachedAuth !== undefined) return cachedAuth;

  const raw = process.env.GA4_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    cachedAuth = null;
    return cachedAuth;
  }
  try {
    const credentials = JSON.parse(raw);
    cachedAuth = new GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    });
  } catch (error) {
    console.error("[ga4-admin] GA4_SERVICE_ACCOUNT_KEY 파싱 실패", error);
    cachedAuth = null;
  }
  return cachedAuth;
}

/** 크리덴셜 미설정이거나 조회 실패면 null — 호출부는 이 경우 수동 입력으로 폴백한다. */
export async function listGa4Properties(): Promise<Ga4PropertyOption[] | null> {
  const auth = getAuth();
  if (!auth) return null;

  try {
    const client = await auth.getClient();
    const accountsRes = await client.request<Ga4AccountsResponse>({
      url: "https://analyticsadmin.googleapis.com/v1beta/accounts",
    });
    const accounts = accountsRes.data.accounts ?? [];

    const perAccount = await Promise.all(
      accounts.map(async (account) => {
        const propsRes = await client.request<Ga4PropertiesResponse>({
          url: "https://analyticsadmin.googleapis.com/v1beta/properties",
          params: { filter: `parent:${account.name}` },
        });
        return (propsRes.data.properties ?? []).map((property) => ({
          propertyId: property.name.replace("properties/", ""),
          displayName: property.displayName,
          accountDisplayName: account.displayName,
        }));
      }),
    );

    return perAccount.flat().sort((a, b) => a.displayName.localeCompare(b.displayName, "ko"));
  } catch (error) {
    console.error("[ga4-admin] listGa4Properties 실패", error);
    return null;
  }
}
