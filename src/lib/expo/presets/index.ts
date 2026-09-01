import type { ExpoPageConfigV2 } from "@/lib/expo/types";
import { instantiateStkHomeV1, STK_HOME_V1_ID } from "@/lib/expo/presets/stk-home-v1";

export interface BuiltInExpoPreset {
  readonly id: typeof STK_HOME_V1_ID;
  readonly name: string;
  readonly description: string;
  readonly builtIn: true;
  instantiate(input?: { randomUUID?: () => string }): ExpoPageConfigV2;
}

const STK: BuiltInExpoPreset = Object.freeze({
  id: STK_HOME_V1_ID,
  name: "STK 2027 홈페이지",
  description: "승인된 STK 2027 관리 구획 6개와 검토된 콘텐츠로 시작합니다.",
  builtIn: true,
  instantiate: instantiateStkHomeV1,
});

const BUILT_INS: readonly BuiltInExpoPreset[] = Object.freeze([STK]);

export function builtInExpoPresets(): readonly BuiltInExpoPreset[] {
  return BUILT_INS;
}

export function isBuiltInExpoPresetId(id: string): id is BuiltInExpoPreset["id"] {
  return id === STK_HOME_V1_ID;
}

export function instantiateBuiltInPreset(
  id: string,
  input?: { randomUUID?: () => string },
): ExpoPageConfigV2 {
  const preset = BUILT_INS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown built-in Expo preset: ${id}`);
  return preset.instantiate(input);
}
