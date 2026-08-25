// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GA4 속성 드롭다운(ProjectAnalyticsSettingsModal)이 기대는 계약:
 *  · 크리덴셜이 없거나 깨졌으면 절대 API를 호출하지 않고 null 을 준다 — 호출부가 수동 입력으로 폴백한다.
 *  · 여러 계정의 속성을 한 목록으로 모으고, 화면에 그대로 뿌릴 수 있게 이름순으로 정렬한다.
 *  · Admin API 호출이 실패해도(네트워크 등) throw 하지 않는다 — GA4 미설정 프로젝트와 같은 폴백 경로.
 */

const requestMock = vi.fn();
const getClientMock = vi.fn(async () => ({ request: requestMock }));

vi.mock("google-auth-library", () => ({
  GoogleAuth: vi.fn().mockImplementation(() => ({ getClient: getClientMock })),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("listGa4Properties", () => {
  it("GA4_SERVICE_ACCOUNT_KEY 가 없으면 null — API를 호출하지 않는다", async () => {
    vi.stubEnv("GA4_SERVICE_ACCOUNT_KEY", "");
    const { listGa4Properties } = await import("@/lib/ga4-admin");
    expect(await listGa4Properties()).toBeNull();
    expect(getClientMock).not.toHaveBeenCalled();
  });

  it("크리덴셜 JSON이 깨졌으면 null", async () => {
    vi.stubEnv("GA4_SERVICE_ACCOUNT_KEY", "{not json");
    const { listGa4Properties } = await import("@/lib/ga4-admin");
    expect(await listGa4Properties()).toBeNull();
    expect(getClientMock).not.toHaveBeenCalled();
  });

  it("계정 여러 개의 속성을 모아 표시명 기준으로 정렬해 반환한다", async () => {
    vi.stubEnv("GA4_SERVICE_ACCOUNT_KEY", JSON.stringify({ client_email: "svc@example.com", private_key: "key" }));
    requestMock.mockImplementation(async ({ url, params }: { url: string; params?: Record<string, string> }) => {
      if (url.endsWith("/accounts")) {
        return {
          data: {
            accounts: [
              { name: "accounts/1", displayName: "Korea Expo" },
              { name: "accounts/2", displayName: "Korea Expo LA" },
            ],
          },
        };
      }
      if (url.endsWith("/properties")) {
        if (params?.filter === "parent:accounts/1") {
          return { data: { properties: [{ name: "properties/424519141", displayName: "Zeta Property" }] } };
        }
        if (params?.filter === "parent:accounts/2") {
          return { data: { properties: [{ name: "properties/538175534", displayName: "Alpha Property" }] } };
        }
      }
      throw new Error(`예상 밖 요청: ${url} ${JSON.stringify(params)}`);
    });

    const { listGa4Properties } = await import("@/lib/ga4-admin");
    const result = await listGa4Properties();

    expect(result).toEqual([
      { propertyId: "538175534", displayName: "Alpha Property", accountDisplayName: "Korea Expo LA" },
      { propertyId: "424519141", displayName: "Zeta Property", accountDisplayName: "Korea Expo" },
    ]);
  });

  it("Admin API 호출이 실패해도 throw 하지 않고 null 을 준다", async () => {
    vi.stubEnv("GA4_SERVICE_ACCOUNT_KEY", JSON.stringify({ client_email: "svc@example.com", private_key: "key" }));
    requestMock.mockRejectedValue(new Error("network down"));

    const { listGa4Properties } = await import("@/lib/ga4-admin");
    await expect(listGa4Properties()).resolves.toBeNull();
  });
});
