import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_META_METRICS, decryptMetaToken, encryptMetaToken, metricValue, signMetaState, verifyMetaState } from "@/lib/meta-ads";

describe("Meta Ads 연결 보안과 지표", () => {
  const previousSecret = process.env.META_APP_SECRET;
  const previousEncryption = process.env.META_TOKEN_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.META_APP_SECRET = "test-app-secret";
    process.env.META_TOKEN_ENCRYPTION_KEY = "test-encryption-key";
  });
  afterEach(() => {
    process.env.META_APP_SECRET = previousSecret;
    process.env.META_TOKEN_ENCRYPTION_KEY = previousEncryption;
  });

  it("access token을 평문으로 저장하지 않고 복호화할 수 있다", () => {
    const encrypted = encryptMetaToken("sensitive-token");
    expect(encrypted).not.toContain("sensitive-token");
    expect(decryptMetaToken(encrypted)).toBe("sensitive-token");
  });

  it("OAuth state 변조를 거부한다", () => {
    const state = signMetaState({ projectId: "p1" });
    expect(verifyMetaState<{ projectId: string }>(state)?.projectId).toBe("p1");
    expect(verifyMetaState(`${state}x`)).toBeNull();
  });

  it("actions 배열에서 지정한 전환 지표를 고른다", () => {
    const actions = [{ action_type: "lead", value: "4" }, { action_type: "purchase", value: "2" }];
    expect(metricValue(actions, "purchase")).toBe(2);
    expect(DEFAULT_META_METRICS).toEqual(expect.arrayContaining(["cpm", "cpc", "cost_per_action_type", "purchase_roas"]));
  });
});
