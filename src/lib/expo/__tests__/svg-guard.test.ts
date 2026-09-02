import { describe, expect, it } from "vitest";
import { inspectSvg } from "@/lib/expo/svg-guard";

const bytes = (source: string) => new TextEncoder().encode(source);

describe("SVG upload safety", () => {
  it.each([
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>html</div></foreignObject></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><iframe/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><object/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><embed/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/x.png"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><use xlink:href="data:image/png;base64,eA==" xmlns:xlink="http://www.w3.org/1999/xlink"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path onclick="alert(1)" d="M0 0"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><style>@import "https://evil.example/x.css";</style></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><style>@font-face{font-family:x;src:url(#x)}</style></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path style="width:expression(alert(1))"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path style="background:javascript:alert(1)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path fill="url(https://evil.example/x.svg#p)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" xml:base="https://evil.example/"><use href="#icon"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="href" values="#icon;https://evil.example/x.svg#icon"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><set attributeName="href" to="https://evil.example/x.svg#icon"/></svg>',
    '<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"></svg>',
    '<?xml-stylesheet href="https://evil.example/x.css"?><svg xmlns="http://www.w3.org/2000/svg"/>',
  ])("rejects executable SVG", (source) => {
    expect(inspectSvg(bytes(source))).toMatchObject({ ok: false });
  });

  it("accepts fragment-only references and returns dimensions", () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><defs><linearGradient id="g"/></defs><path fill="url(#g)" d="M0 0h10v10z"/></svg>';
    expect(inspectSvg(bytes(source))).toMatchObject({ ok: true, width: 100, height: 50 });
  });

  it("rejects a non-SVG root and malformed XML", () => {
    expect(inspectSvg(bytes("<html/>"))).toMatchObject({ ok: false });
    expect(inspectSvg(bytes('<svg xmlns="http://www.w3.org/2000/svg"><g></svg>'))).toMatchObject({ ok: false });
  });

  it("returns a rejection for invalid UTF-8 instead of throwing", () => {
    expect(inspectSvg(new Uint8Array([0xff, 0xfe, 0xfd]))).toMatchObject({ ok: false });
  });
});
