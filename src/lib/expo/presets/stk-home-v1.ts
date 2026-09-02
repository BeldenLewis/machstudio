import { normalizeExpoPage } from "@/lib/expo/config";
import type { ExpoPageConfigV2 } from "@/lib/expo/types";
import source from "@/lib/expo/presets/stk-home-v1.json";

export const STK_HOME_V1_ID = "stk-home-v1" as const;

export function instantiateStkHomeV1(input: { randomUUID?: () => string } = {}): ExpoPageConfigV2 {
  const randomUUID = input.randomUUID ?? (() => crypto.randomUUID());
  const normalized = normalizeExpoPage(structuredClone(source.config));
  return {
    ...normalized,
    preset: STK_HOME_V1_ID,
    sections: normalized.sections.map((section) => ({
      ...section,
      sid: randomUUID(),
      embedEnabled: false,
    })),
  };
}
