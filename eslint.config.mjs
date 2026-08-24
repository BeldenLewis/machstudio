import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    /**
     * 생성물은 린트하지 않는다 — 우리가 고칠 수 없는 코드다.
     * Prisma 클라이언트 하나가 오류 846건(전체의 87%)을 만들어 린트 신호를 통째로
     * 덮고 있었다. 임베드 런타임 번들도 같은 이유로 뺀다.
     */
    "src/generated/**",
  ]),
  {
    files: ["src/app/(app)/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.type='MemberExpression'][object.object.name='window'][object.property.name='location'][property.name='origin']",
          message: "공개 URL·설치 코드는 getPublicAppOrigin()을 사용하세요. 예외는 이유와 함께 eslint-disable 하세요.",
        },
      ],
    },
  },
]);

export default eslintConfig;
