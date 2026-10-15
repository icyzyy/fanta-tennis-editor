import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  searchAll: vi.fn(),
  setDirtyCount: vi.fn(),
  setBackup: vi.fn(),
  saveEntry: vi.fn(),
}));
vi.mock("../api", async () => {
  const errors = await import("../api/errors");
  return { ...apiMock, ...errors };
});
const runtimeMock = vi.hoisted(() => ({
  Dialogs: { OpenFile: vi.fn(), Question: vi.fn() },
}));
vi.mock("@wailsio/runtime", () => runtimeMock);

import { useAppStore } from "../state/appStore";
import { useBufferStore, type BufferDoc } from "../state/bufferStore";
import { useSearchStore } from "../state/searchStore";
import { useWorkspaceStore } from "../state/workspaceStore";
import { Toolbar } from "./Toolbar";

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.searchAll.mockResolvedValue({ hits: 0, warnings: 0, cancelled: false });
  useSearchStore.setState({
    query: "",
    hits: [],
    warnings: [],
    progress: null,
    running: false,
    summary: null,
    error: null,
    inflight: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Toolbar search confirmation", () => {
  it("typing only updates the query — no automatic search", async () => {
    vi.useFakeTimers();
    render(<Toolbar onOpenSettings={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Global search"), {
      target: { value: "pet" },
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(apiMock.searchAll).not.toHaveBeenCalled();
    expect(useSearchStore.getState().query).toBe("pet");
  });

  it("Enter confirms the search", async () => {
    render(<Toolbar onOpenSettings={vi.fn()} />);
    const input = screen.getByLabelText("Global search");
    fireEvent.change(input, { target: { value: "pet" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(apiMock.searchAll).toHaveBeenCalledTimes(1));
    expect(apiMock.searchAll).toHaveBeenCalledWith(
      expect.objectContaining({ query: "pet", caseSensitive: false }),
    );
  });

  it("clicking the Search button confirms the search", async () => {
    render(<Toolbar onOpenSettings={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Global search"), {
      target: { value: "pet" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(apiMock.searchAll).toHaveBeenCalledTimes(1));
  });
});

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

describe("Toolbar back to picker", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      root: "/r",
      archives: [{ path: "/r/A.res", size: 10, modTime: 1 }],
      entries: {},
      expanded: {},
      expandedDirs: {},
      discovery: null,
      extractProgress: null,
      loading: false,
      error: null,
    });
    useBufferStore.setState({ buffers: [], activeId: null });
    useAppStore.setState({ mode: "workspace" });
  });

  it("Back to picker shows even without a workspace; Open Workspace is gone", () => {
    // A failed open lands in workspace mode with root "" behind only an
    // error banner, so Back to picker must render there too — opening a
    // workspace now lives exclusively in the picker.
    useWorkspaceStore.setState({ root: "" });
    render(<Toolbar onOpenSettings={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /back to picker/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /open workspace/i }),
    ).not.toBeInTheDocument();
  });

  it("Back to picker is disabled while an open is in flight", () => {
    // Closing during an in-flight open could repopulate root after close.
    useWorkspaceStore.setState({ loading: true });
    render(<Toolbar onOpenSettings={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /back to picker/i }),
    ).toBeDisabled();
  });

  it("clean back goes straight to the picker", async () => {
    useSearchStore.setState({ query: "pet" });
    render(<Toolbar onOpenSettings={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /back to picker/i }));
    await waitFor(() => expect(useAppStore.getState().mode).toBe("picker"));
    expect(useWorkspaceStore.getState().root).toBe("");
    expect(runtimeMock.Dialogs.Question).not.toHaveBeenCalled();
    // search state is untouched by closing (spec §246)
    expect(useSearchStore.getState().query).toBe("pet");
  });

  it("dirty buffers prompt Save all / Discard / Cancel", async () => {
    useBufferStore.setState({
      buffers: [dirtySetBuffer("/r/A.res", "a.set")],
      activeId: "/r/A.res::a.set",
    });
    runtimeMock.Dialogs.Question.mockResolvedValue("Cancel");
    render(<Toolbar onOpenSettings={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /back to picker/i }));
    await waitFor(() =>
      expect(runtimeMock.Dialogs.Question).toHaveBeenCalledTimes(1),
    );
    expect(runtimeMock.Dialogs.Question).toHaveBeenCalledWith(
      expect.objectContaining({
        Message:
          "1 buffer(s) have unsaved changes. Save them, discard them, or cancel closing the workspace?",
        Buttons: [
          { Label: "Cancel", IsDefault: true, IsCancel: true },
          { Label: "Discard changes" },
          { Label: "Save all" },
        ],
      }),
    );
    // The Cancel answer must settle before asserting the outcome: wait on
    // the flow's terminal mode (the old wait polled a buffer length that
    // was already true before the click was processed).
    await waitFor(() => expect(useAppStore.getState().mode).toBe("workspace"));
    expect(useWorkspaceStore.getState().root).toBe("/r");
    expect(useBufferStore.getState().buffers).toHaveLength(1);
    expect(useBufferStore.getState().buffers[0].dirty).toBe(true);
  });

  it("Discard clears buffers and workspace and returns to the picker", async () => {
    useBufferStore.setState({
      buffers: [dirtySetBuffer("/r/A.res", "a.set")],
      activeId: "/r/A.res::a.set",
    });
    runtimeMock.Dialogs.Question.mockResolvedValue("Discard changes");
    render(<Toolbar onOpenSettings={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /back to picker/i }));
    await waitFor(() => expect(useAppStore.getState().mode).toBe("picker"));
    expect(useBufferStore.getState().buffers).toEqual([]);
    expect(useWorkspaceStore.getState().root).toBe("");
    // clear() pushes dirty 0 through the existing path
    expect(apiMock.setDirtyCount).toHaveBeenCalledWith(0);
  });

  it("Save all saves every dirty buffer before closing", async () => {
    apiMock.saveEntry.mockResolvedValue({ revision: 7 });
    useBufferStore.setState({
      buffers: [
        dirtySetBuffer("/r/A.res", "a.set"),
        dirtySetBuffer("/r/A.res", "b.set"),
      ],
      activeId: "/r/A.res::a.set",
    });
    runtimeMock.Dialogs.Question.mockResolvedValue("Save all");
    // closeWorkspaceFlow flips the mode through the fresh lookup
    // useAppStore.getState().setMode(...), so a spy on the current state
    // object intercepts it without touching production code.
    const appState = useAppStore.getState();
    const setModeSpy = vi.spyOn(appState, "setMode");
    try {
      render(<Toolbar onOpenSettings={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: /back to picker/i }));
      await waitFor(() => expect(useAppStore.getState().mode).toBe("picker"));
      expect(apiMock.saveEntry).toHaveBeenCalledTimes(2);
      // Ordering: both saves must have STARTED before the mode flip.
      const saveOrder = apiMock.saveEntry.mock.invocationCallOrder;
      const flipOrder = setModeSpy.mock.invocationCallOrder;
      expect(flipOrder).toHaveLength(1);
      expect(flipOrder[0]).toBeGreaterThan(saveOrder[saveOrder.length - 1]);
      expect(useBufferStore.getState().buffers).toEqual([]);
      expect(useWorkspaceStore.getState().root).toBe("");
    } finally {
      setModeSpy.mockRestore();
      // The flip replaced the state object, and the new one still carries
      // the spy reference — put the original action back.
      useAppStore.setState({ setMode: appState.setMode });
    }
  });

  it("Cancel keeps the workspace open", async () => {
    useBufferStore.setState({
      buffers: [dirtySetBuffer("/r/A.res", "a.set")],
      activeId: "/r/A.res::a.set",
    });
    runtimeMock.Dialogs.Question.mockResolvedValue("Cancel");
    render(<Toolbar onOpenSettings={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /back to picker/i }));
    await waitFor(() =>
      expect(runtimeMock.Dialogs.Question).toHaveBeenCalledTimes(1),
    );
    expect(useAppStore.getState().mode).toBe("workspace");
    expect(useBufferStore.getState().buffers).toHaveLength(1);
    expect(useBufferStore.getState().buffers[0].dirty).toBe(true);
    expect(useWorkspaceStore.getState().root).toBe("/r");
  });
});
