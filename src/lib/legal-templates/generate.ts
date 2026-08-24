import type { Country, CountrySections, GenerateInput, GenerateOutput, Section } from "./types";
import { US_SECTIONS } from "./sections/us";
import { KR_SECTIONS } from "./sections/kr";

/** 나라 추가 시 여기 한 줄 + sections/{country}.ts 하나만 새로 만들면 된다. */
const REGISTRY: Record<Country, CountrySections> = {
  us: US_SECTIONS,
  kr: KR_SECTIONS,
};

function composeSections(ctx: GenerateInput, sections: readonly Section[]): string {
  return sections
    .filter((section) => {
      const purposeMatches = section.purposes === "any" || section.purposes.includes(ctx.purpose);
      if (!purposeMatches) return false;
      return !section.when || section.when(ctx);
    })
    .map((section) => section.render(ctx))
    .join("\n\n");
}

/**
 * 세 문서를 생성한다. marketing 은 `marketingOffered` 가 꺼져 있으면, thirdParty 는
 * `event.thirdParties` 가 비어 있으면 각각 `null` — 그 폼에 안 쓰는 문서는 아예 만들지 않는다.
 */
export function generateConsentDocuments(input: GenerateInput): GenerateOutput {
  const table = REGISTRY[input.country] ?? REGISTRY.us;

  const privacy = {
    label: table.labels.privacy(input),
    body: composeSections(input, table.privacy),
  };

  const marketing = input.marketingOffered
    ? { label: table.labels.marketing(input), body: composeSections(input, table.marketing) }
    : null;

  const thirdParty =
    input.event.thirdParties.length > 0
      ? { label: table.labels.thirdParty(input), body: composeSections(input, table.thirdParty) }
      : null;

  return { privacy, marketing, thirdParty };
}
