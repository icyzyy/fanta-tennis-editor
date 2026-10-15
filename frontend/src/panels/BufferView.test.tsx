import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  openWorkspace: vi.fn(),
  listEntries: vi.fn(),
  readEntry: vi.fn(),
  previewImage: vi.fn(),
  saveEntry: vi.fn(),
  setDirtyCount: vi.fn(() => Promise.resolve()),
  setBackup: vi.fn(() => Promise.resolve()),
  searchAll: vi.fn(),
  extract: vi.fn(),
}));
vi.mock("../api", async () => {
  const errors = await import("../api/errors");
  return { ...apiMock, ...errors };
});

import type { BufferDoc } from "../state/bufferStore";
import { useBufferStore } from "../state/bufferStore";
import { BufferView } from "./BufferView";

function seed(over: Partial<BufferDoc> = {}): BufferDoc {
  const doc: BufferDoc = {
    id: "Gui2.res::Gui_Login.set",
    archive: "Gui2.res",
    entry: "Gui_Login.set",
    kind: "set",
    content: { kind: "xml", text: "<a/>" },
    loading: false,
    error: null,
    text: "<a/>",
    raw: "<a/>",
    dirty: false,
    saving: false,
    saveError: null,
    revision: null,
    scrollLine: null,
    ...over,
  };
  useBufferStore.setState({ buffers: [doc], activeId: doc.id });
  return doc;
}

beforeEach(() => {
  vi.clearAllMocks();
  useBufferStore.setState({ buffers: [], activeId: null });
});

describe("BufferView", () => {
  it("asks to select an entry without an active buffer", () => {
    render(<BufferView />);
    expect(
      screen.getByText(/select an entry in the workspace tree/i),
    ).toBeInTheDocument();
  });

  it("shows a loading state", () => {
    seed({ loading: true, content: null });
    render(<BufferView />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });

  it("shows open failures as an alert", () => {
    seed({ error: { code: "not_found", message: "entry gone" } });
    render(<BufferView />);
    expect(screen.getByRole("alert")).toHaveTextContent("not_found");
    expect(screen.getByRole("alert")).toHaveTextContent("entry gone");
  });

  it("dispatches png content to TexturePreview", () => {
    seed({
      kind: "tex",
      content: {
        kind: "png",
        data: "AA==",
        texture: { width: 8, height: 8, format: "DXT5" },
      },
    });
    render(<BufferView />);
    expect(
      screen.getByRole("img", { name: "texture preview" }),
    ).toBeInTheDocument();
    expect(screen.getByText("8×8 · DXT5")).toBeInTheDocument();
  });

  it("dispatches .set xml to the editable XmlEditor", () => {
    seed({ content: { kind: "xml", text: "<a/>" } });
    const { container } = render(<BufferView />);
    expect(container.querySelector(".cm-content")).toBeInTheDocument();
  });

  it("dispatches binary content to HexView", () => {
    seed({ kind: "other", content: { kind: "binary", data: btoa("AB") } });
    const { container } = render(<BufferView />);
    expect(container.querySelector('[data-row="0"]')).toBeInTheDocument();
  });

  it("dispatches .bmp binary content to the native BMP viewer", () => {
    seed({
      entry: "LogoPub_Ini3.bmp",
      kind: "other",
      content: { kind: "binary", data: btoa("BM__") },
    });
    render(<BufferView />);
    const img = screen.getByRole("img", { name: "bmp preview" });
    expect(img).toHaveAttribute("src", `data:image/bmp;base64,${btoa("BM__")}`);
  });

  it("renders the utf-8 text fallback read-only", () => {
    seed({ kind: "other", content: { kind: "text", text: "hello world" } });
    render(<BufferView />);
    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  it("passes the original totalBytes through to HexView", () => {
    seed({
      kind: "other",
      content: {
        kind: "binary",
        data: btoa("AB"),
        truncated: true,
        totalBytes: 70000,
      },
    });
    render(<BufferView />);
    expect(screen.getByText("70000 bytes")).toBeInTheDocument();
  });

  it("flags a truncated text payload with an Extract hint", () => {
    seed({
      kind: "other",
      content: {
        kind: "text",
        text: "head of the payload",
        truncated: true,
        totalBytes: 5242880,
      },
    });
    render(<BufferView />);
    expect(screen.getByText(/truncated preview/)).toBeInTheDocument();
    expect(screen.getByText(/5242880 bytes/)).toBeInTheDocument();
    expect(
      screen.getByText(/use Extract for a full copy/),
    ).toBeInTheDocument();
  });
});
