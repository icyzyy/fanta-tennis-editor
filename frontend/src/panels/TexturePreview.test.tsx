import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Content } from "../api";
import { useToastStore } from "../state/toastStore";
import { TexturePreview } from "./TexturePreview";

const apiMock = vi.hoisted(() => ({ exportTexturePng: vi.fn() }));
vi.mock("../api", async () => {
  const errors = await import("../api/errors");
  return { ...apiMock, ...errors };
});
const runtimeMock = vi.hoisted(() => ({
  Dialogs: { SaveFile: vi.fn(() => Promise.resolve("")) },
}));
vi.mock("@wailsio/runtime", () => runtimeMock);

const png: Content = {
  kind: "png",
  data: "AAEC/w==",
  texture: { width: 64, height: 32, format: "DXT1" },
};

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
});

describe("TexturePreview", () => {
  it("shows the decoded image with a size/format badge", () => {
    render(<TexturePreview content={png} />);
    const img = screen.getByRole("img", { name: "texture preview" });
    expect(img).toHaveAttribute("src", "data:image/png;base64,AAEC/w==");
    expect(screen.getByText("64×32 · DXT1")).toBeInTheDocument();
  });

  it("toggles fit ↔ 100%", () => {
    render(<TexturePreview content={png} />);
    const img = screen.getByRole("img", { name: "texture preview" });
    expect(img.className).toContain("object-contain"); // fit is default

    fireEvent.click(screen.getByRole("button", { name: "100%" }));
    expect(img.className).not.toContain("object-contain");
    expect(screen.getByRole("button", { name: "Fit" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Fit" }));
    expect(img.className).toContain("object-contain");
  });

  it("shows a placeholder without payload", () => {
    render(<TexturePreview content={{ kind: "png" }} />);
    expect(screen.getByText("no texture payload")).toBeInTheDocument();
  });

  it("exports the texture as PNG through the save dialog", async () => {
    runtimeMock.Dialogs.SaveFile.mockResolvedValue("/tmp/t.png");
    apiMock.exportTexturePng.mockResolvedValue({ ok: true, dest: "/tmp/t.png" });
    render(<TexturePreview content={png} archive="/r/A.res" entry="T.tex" />);
    fireEvent.click(screen.getByRole("button", { name: /export png/i }));
    await waitFor(() =>
      expect(apiMock.exportTexturePng).toHaveBeenCalledWith({
        archive: "/r/A.res",
        entry: "T.tex",
        dest: "/tmp/t.png",
      }),
    );
    expect(useToastStore.getState().toasts.some((t) => t.kind === "success")).toBe(true);
  });
});
