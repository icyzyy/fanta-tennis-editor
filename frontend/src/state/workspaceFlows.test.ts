import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  openWorkspace: vi.fn(),
  saveEntry: vi.fn(),
  setDirtyCount: vi.fn(),
}));
vi.mock("../api", async () => {
  const errors = await import("../api/errors");
  return { ...apiMock, ...errors };
});
const runtimeMock = vi.hoisted(() => ({
  Dialogs: { OpenFile: vi.fn(), Question: vi.fn() },
}));
vi.mock("@wailsio/runtime", () => runtimeMock);

import { useBufferStore, type BufferDoc } from "./bufferStore";
import { useWorkspaceStore } from "./workspaceStore";
import { selectResourceFolder } from "./workspaceFlows";

function dirtySetBuffer(archive: string, entry: string): BufferDoc {
  return {
    id: `${archive}::${entry}`,
    archive,
    entry,
    kind: "set",
    content: null,
    loading: false,
    error: null,
    text: "<changed/>",
    raw: "<orig/>",
    dirty: true,
    saving: false,
    saveError: null,
    revision: 1,
    scrollLine: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks(); // clears calls, keeps vi.fn implementations
  useWorkspaceStore.setState({
    root: "",
    archives: [],
    entries: {},
    expanded: {},
    expandedDirs: {},
    discovery: null,
    extractProgress: null,
    loading: false,
    error: null,
  });
  useBufferStore.setState({ buffers: [], activeId: null });
});

// selectResourceFolder is only reachable through the picker button (the
// workspace toolbar no longer opens folders), and the picker only shows
// with an empty, buffer-free workspace — so these switch scenarios, which
// need an already-open workspace plus dirty buffers, drive the flow
// directly instead of through the UI.
describe("selectResourceFolder switch flow", () => {
  it("switching workspace with dirty buffers asks first; Cancel keeps them", async () => {
    runtimeMock.Dialogs.OpenFile.mockResolvedValue("/data/Other");
    runtimeMock.Dialogs.Question.mockResolvedValue("Cancel");
    useBufferStore.setState({
      buffers: [dirtySetBuffer("/r/A.res", "b.set")],
      activeId: "/r/A.res::b.set",
    });

    await selectResourceFolder();

    expect(runtimeMock.Dialogs.Question).toHaveBeenCalledTimes(1);
    expect(runtimeMock.Dialogs.Question).toHaveBeenCalledWith(
      expect.objectContaining({
        Message:
          "1 buffer(s) have unsaved changes. Save them, discard them, or cancel the switch?",
      }),
    );
    expect(apiMock.openWorkspace).not.toHaveBeenCalled();
    expect(useBufferStore.getState().buffers).toHaveLength(1);
    expect(useBufferStore.getState().buffers[0].dirty).toBe(true);
  });

  it("Discard clears the buffer store and switches", async () => {
    runtimeMock.Dialogs.OpenFile.mockResolvedValue("/data/Other");
    runtimeMock.Dialogs.Question.mockResolvedValue("Discard changes");
    apiMock.openWorkspace.mockResolvedValue({
      root: "/data/Other",
      archives: [],
    });
    useBufferStore.setState({
      buffers: [dirtySetBuffer("/r/A.res", "b.set")],
      activeId: "/r/A.res::b.set",
    });

    await selectResourceFolder();

    expect(apiMock.openWorkspace).toHaveBeenCalledWith("/data/Other");
    expect(useBufferStore.getState().buffers).toHaveLength(0);
    expect(apiMock.setDirtyCount).toHaveBeenLastCalledWith(0);
  });

  it("Save all saves every dirty buffer before switching", async () => {
    runtimeMock.Dialogs.OpenFile.mockResolvedValue("/data/Other");
    runtimeMock.Dialogs.Question.mockResolvedValue("Save all");
    apiMock.openWorkspace.mockResolvedValue({
      root: "/data/Other",
      archives: [],
    });
    apiMock.saveEntry.mockResolvedValue({ ok: true, revision: 3 });
    useBufferStore.setState({
      buffers: [
        dirtySetBuffer("/r/A.res", "a.set"),
        dirtySetBuffer("/r/A.res", "b.set"),
      ],
      activeId: "/r/A.res::a.set",
    });

    await selectResourceFolder();

    expect(apiMock.saveEntry).toHaveBeenCalledTimes(2);
    expect(apiMock.saveEntry).toHaveBeenCalledWith(
      expect.objectContaining({ archive: "/r/A.res", entry: "a.set" }),
    );
    expect(apiMock.openWorkspace).toHaveBeenCalledWith("/data/Other");
    expect(useBufferStore.getState().buffers).toHaveLength(0);
  });

  it("a failed Save all aborts the switch and keeps the buffer dirty", async () => {
    runtimeMock.Dialogs.OpenFile.mockResolvedValue("/data/Other");
    runtimeMock.Dialogs.Question.mockResolvedValue("Save all");
    apiMock.openWorkspace.mockResolvedValue({
      root: "/data/Other",
      archives: [],
    });
    apiMock.saveEntry.mockRejectedValue(new Error("bad xml"));
    useBufferStore.setState({
      buffers: [dirtySetBuffer("/r/A.res", "b.set")],
      activeId: "/r/A.res::b.set",
    });

    await selectResourceFolder();

    expect(runtimeMock.Dialogs.Question).toHaveBeenCalledTimes(1);
    expect(apiMock.openWorkspace).not.toHaveBeenCalled();
    const b = useBufferStore.getState().buffers[0];
    expect(b.dirty).toBe(true);
    expect(b.saveError?.message).toBe("bad xml");
  });

  it("re-opening the same root keeps buffers without asking", async () => {
    runtimeMock.Dialogs.OpenFile.mockResolvedValue("/data/Res");
    apiMock.openWorkspace.mockResolvedValue({
      root: "/data/Res",
      archives: [],
    });
    useWorkspaceStore.setState({ root: "/data/Res" });
    useBufferStore.setState({
      buffers: [dirtySetBuffer("/r/A.res", "b.set")],
      activeId: "/r/A.res::b.set",
    });

    await selectResourceFolder();

    expect(runtimeMock.Dialogs.Question).not.toHaveBeenCalled();
    expect(apiMock.openWorkspace).toHaveBeenCalledWith("/data/Res");
    expect(useBufferStore.getState().buffers).toHaveLength(1);
  });
});
