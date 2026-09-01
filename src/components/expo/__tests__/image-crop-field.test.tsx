// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImageCropField, cropPreviewStyle } from "@/components/expo/fields/ImageCropField";

const image = { kind: "image" as const, url: "https://cdn.example.com/speaker.png", decorative: false };

describe("ImageCropField", () => {
  it("shares the runtime object-position/scale formula", () => {
    expect(cropPreviewStyle({ fit: "cover", x: 25, y: 75, scale: 1.2 })).toEqual({
      objectFit: "cover", objectPosition: "25% 75%", transform: "scale(1.2)", transformOrigin: "25% 75%",
    });
  });

  it("exposes labelled fit/x/y/scale controls, preview, and reset", () => {
    const onChange = vi.fn();
    render(<ImageCropField image={image} value={{ fit: "contain", x: 10, y: 20, scale: 1.4 }} onChange={onChange} />);
    expect(screen.getByLabelText("이미지 맞춤 방식")).toHaveValue("contain");
    expect(screen.getByLabelText("가로 초점")).toHaveValue("10");
    expect(screen.getByLabelText("세로 초점")).toHaveValue("20");
    expect(screen.getByLabelText("확대 배율")).toHaveValue("1.4");
    expect(screen.getByRole("img", { name: "자르기 미리보기" })).toHaveStyle({ objectPosition: "10% 20%", transform: "scale(1.4)" });
    fireEvent.click(screen.getByRole("button", { name: "이미지 자르기 초기화" }));
    expect(onChange).toHaveBeenCalledWith({ fit: "cover", x: 50, y: 50, scale: 1 });
  });
});
