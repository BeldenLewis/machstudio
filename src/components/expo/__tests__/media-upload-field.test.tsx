// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpoMediaUploadField } from "@/components/expo/fields/ExpoMediaUploadField";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("ExpoMediaUploadField", () => {
  it("accepts only validated external HTTPS URLs", () => {
    const onChange = vi.fn();
    render(<ExpoMediaUploadField siteId="site1" kind="image" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("외부 이미지 HTTPS 주소"), { target: { value: "http://cdn.example.com/a.png" } });
    fireEvent.click(screen.getByRole("button", { name: "외부 주소 적용" }));
    expect(screen.getByText(/HTTPS/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("외부 이미지 HTTPS 주소"), { target: { value: "https://cdn.example.com/a.png" } });
    fireEvent.click(screen.getByRole("button", { name: "외부 주소 적용" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: "image", url: "https://cdn.example.com/a.png", originalUrl: "https://cdn.example.com/a.png" }));
  });

  it("keeps the latest onChange callback across a long signed upload", async () => {
    let releaseSession!: () => void;
    const wait = new Promise<void>((resolve) => { releaseSession = resolve; });
    fetchMock
      .mockImplementationOnce(async () => {
        await wait;
        return new Response(JSON.stringify({ path: "ws/expo-quarantine/site/user/x.png", signedUrl: "https://storage.test/upload", token: "t" }), { status: 201 });
      })
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        kind: "image", url: "https://cdn.test/o.webp", originalUrl: "https://cdn.test/x.png",
        mimeType: "image/webp", width: 100, height: 50, bytes: 500,
      }), { status: 201 }));
    const oldChange = vi.fn();
    const latestChange = vi.fn();
    const view = render(<ExpoMediaUploadField siteId="site" kind="image" onChange={oldChange} />);
    const file = new File([new Uint8Array([1, 2, 3])], "hero.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("이미지 파일 선택"), { target: { files: [file] } });
    view.rerender(<ExpoMediaUploadField siteId="site" kind="image" onChange={latestChange} />);
    releaseSession();

    await waitFor(() => expect(latestChange).toHaveBeenCalled());
    expect(oldChange).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "/api/expo/site/media/session", "https://storage.test/upload", "/api/expo/site/media/finalize",
    ]);
  });

  it("marks every newly selected video rights status as unconfirmed", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ path: "ws/expo-quarantine/site/user/x.mp4", signedUrl: "https://storage.test/upload", token: "t" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ kind: "video", url: "https://cdn.test/x.mp4", originalUrl: "https://cdn.test/x.mp4", mimeType: "video/mp4", bytes: 20 }), { status: 201 }));
    const onChange = vi.fn();
    render(<ExpoMediaUploadField siteId="site" kind="video" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("영상 파일 선택"), { target: { files: [new File([new Uint8Array(20)], "hero.mp4", { type: "video/mp4" })] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ rightsStatus: "unconfirmed" })));
  });

  it("requires alt text unless the image is explicitly decorative", () => {
    const value = { kind: "image" as const, url: "https://cdn.test/a.png", originalUrl: "https://cdn.test/a.png", decorative: false };
    const onChange = vi.fn();
    render(<ExpoMediaUploadField siteId="site" kind="image" value={value} onChange={onChange} />);
    expect(screen.getByText(/설명을 넣거나 장식용/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "장식용 이미지" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ decorative: true, alt: "" }));
  });
});
