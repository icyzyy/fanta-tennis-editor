import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  openWorkspace: vi.fn(),
  listEntries: vi.fn(),
  readEntry: vi.fn(() => Promise.resolve({ kind: "xml", text: "<a/>" })),
  previewImage: vi.fn(),
  saveEntry: vi.fn(() => Promise.resolve({ ok: true, revision: 2 })),
  setDirtyCount: vi.fn(() => Promise.resolve()),
  setBackup: vi.fn(() => Promise.resolve()),
  searchAll: vi.fn(),
  extract: vi.fn(),
}));
vi.mock("../api", async () => {
  const errors = await import("../api/errors");
  return { ...apiMock, ...errors };
});
const runtimeMock = vi.hoisted(() => ({
  Dialogs: { Question: vi.fn(() => Promise.resolve("Keep editing")) },
}));
vi.mock("@wailsio/runtime", () => runtimeMock);

import type { BufferDoc } from "../state/bufferStore";
import { useBufferStore } from "../state/bufferStore";
import { BufferTabs } from "./BufferTabs";

function makeDoc(over: Partial<BufferDoc> = {}): BufferDoc {
  return {
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
}

function seed(over: Partial<BufferDoc> = {}): BufferDoc {
  const doc = makeDoc(over);
  useBufferStore.setState({ buffers: [doc], activeId: doc.id });
  return doc;
}

beforeEach(() => {
  vi.clearAllMocks();
  runtimeMock.Dialogs.Question.mockResolvedValue("Keep editing");
  useBufferStore.setState({ buffers: [], activeId: null });
});

describe("BufferTabs", () => {
  it("renders nothing without buffers", () => {
    const { container } = render(<BufferTabs />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the active tab with a dirty dot", () => {
    seed({ dirty: true });
    const { container } = render(<BufferTabs />);
    expect(
      screen.getByRole("tab", { name: /Gui_Login.set/ }),
    ).toBeInTheDocument();
    expect(container.querySelector('[aria-label="unsaved"]')).not.toBeNull();
  });

  it("clicking a tab activates it", () => {
    const first = makeDoc();
    const second = makeDoc({
      id: "Gui3.res::Other.set",
      archive: "Gui3.res",
      entry: "Other.set",
    });
    useBufferStore.setState({ buffers: [first, second], activeId: first.id });
    render(<BufferTabs />);
    fireEvent.click(screen.getByText("Other.set"));
    expect(useBufferStore.getState().activeId).toBe(
      "Gui3.res::Other.set",
    );
  });

  it("closing a clean buffer is immediate", () => {
    seed();
    render(<BufferTabs />);
    fireEvent.click(
      screen.getByRole("button", { name: "Close Gui_Login.set" }),
    );
    expect(useBufferStore.getState().buffers).toHaveLength(0);
    expect(runtimeMock.Dialogs.Question).not.toHaveBeenCalled();
  });

  it("closing a dirty buffer asks; Keep editing keeps it", async () => {
    seed({ dirty: true });
    render(<BufferTabs />);
    fireEvent.click(
      screen.getByRole("button", { name: "Close Gui_Login.set" }),
    );
    await waitFor(() =>
      expect(runtimeMock.Dialogs.Question).toHaveBeenCalledTimes(1),
    );
    expect(useBufferStore.getState().buffers).toHaveLength(1);
  });

  it("closing a dirty buffer asks; Discard removes it", async () => {
    runtimeMock.Dialogs.Question.mockResolvedValue("Discard");
    seed({ dirty: true });
    render(<BufferTabs />);
    fireEvent.click(
      screen.getByRole("button", { name: "Close Gui_Login.set" }),
    );
    await waitFor(() =>
      expect(useBufferStore.getState().buffers).toHaveLength(0),
    );
  });

  it("save pushes the edited text and clears dirty", async () => {
    seed({ dirty: true, text: "<a><b/></a>" });
    render(<BufferTabs />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(apiMock.saveEntry).toHaveBeenCalledWith({
        archive: "Gui2.res",
        entry: "Gui_Login.set",
        text: "<a><b/></a>",
      }),
    );
    await waitFor(() =>
      expect(useBufferStore.getState().buffers[0]?.dirty).toBe(false),
    );
  });
});

describe("BufferTabs context menu", () => {
  const a = () => makeDoc();
  const b = () =>
    makeDoc({ id: "Gui3.res::Other.set", archive: "Gui3.res", entry: "Other.set" });
  const c = () =>
    makeDoc({ id: "Stage.res::Third.set", archive: "Stage.res", entry: "Third.set" });

  it("right-click opens Close all / Close other tabs", () => {
    useBufferStore.setState({ buffers: [a(), b()], activeId: a().id });
    render(<BufferTabs />);
    fireEvent.contextMenu(screen.getByRole("tab", { name: /Gui_Login.set/ }));
    expect(
      screen.getByRole("menuitem", { name: "Close all tabs" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Close other tabs" }),
    ).toBeInTheDocument();
  });

  it("Close all tabs clears every buffer without asking when clean", () => {
    useBufferStore.setState({ buffers: [a(), b()], activeId: a().id });
    render(<BufferTabs />);
    fireEvent.contextMenu(screen.getByRole("tab", { name: /Gui_Login.set/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Close all tabs" }));
    expect(useBufferStore.getState().buffers).toHaveLength(0);
    expect(runtimeMock.Dialogs.Question).not.toHaveBeenCalled();
  });

  it("Close all asks when a buffer is dirty; Keep editing keeps everything", async () => {
    const dirty = makeDoc({ dirty: true });
    useBufferStore.setState({ buffers: [dirty, b()], activeId: dirty.id });
    render(<BufferTabs />);
    fireEvent.contextMenu(screen.getByRole("tab", { name: /Gui_Login.set/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Close all tabs" }));
    await waitFor(() =>
      expect(runtimeMock.Dialogs.Question).toHaveBeenCalledTimes(1),
    );
    expect(useBufferStore.getState().buffers).toHaveLength(2);
  });

  it("Close all asks when dirty; Discard clears everything", async () => {
    runtimeMock.Dialogs.Question.mockResolvedValue("Discard");
    const dirty = makeDoc({ dirty: true });
    useBufferStore.setState({ buffers: [dirty, b()], activeId: dirty.id });
    render(<BufferTabs />);
    fireEvent.contextMenu(screen.getByRole("tab", { name: /Gui_Login.set/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Close all tabs" }));
    await waitFor(() =>
      expect(useBufferStore.getState().buffers).toHaveLength(0),
    );
  });

  it("Close other tabs keeps only the right-clicked tab", () => {
    useBufferStore.setState({ buffers: [a(), b(), c()], activeId: c().id });
    render(<BufferTabs />);
    fireEvent.contextMenu(screen.getByRole("tab", { name: /Other.set/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Close other tabs" }));
    const s = useBufferStore.getState();
    expect(s.buffers.map((x) => x.id)).toEqual(["Gui3.res::Other.set"]);
    expect(s.activeId).toBe("Gui3.res::Other.set");
  });

  it("Close other tabs confirms discarding dirty edits in the others", async () => {
    runtimeMock.Dialogs.Question.mockResolvedValue("Discard");
    const dirty = makeDoc({ dirty: true });
    useBufferStore.setState({ buffers: [dirty, b()], activeId: b().id });
    render(<BufferTabs />);
    fireEvent.contextMenu(screen.getByRole("tab", { name: /Other.set/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Close other tabs" }));
    await waitFor(() =>
      expect(runtimeMock.Dialogs.Question).toHaveBeenCalledTimes(1),
    );
    expect(useBufferStore.getState().buffers.map((x) => x.id)).toEqual([
      "Gui3.res::Other.set",
    ]);
  });

  it("a single tab offers only Close all", () => {
    seed();
    render(<BufferTabs />);
    fireEvent.contextMenu(screen.getByRole("tab", { name: /Gui_Login.set/ }));
    expect(
      screen.getByRole("menuitem", { name: "Close all tabs" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Close other tabs" }),
    ).toBeNull();
  });

  it("Escape closes the menu", () => {
    useBufferStore.setState({ buffers: [a(), b()], activeId: a().id });
    render(<BufferTabs />);
    fireEvent.contextMenu(screen.getByRole("tab", { name: /Gui_Login.set/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
