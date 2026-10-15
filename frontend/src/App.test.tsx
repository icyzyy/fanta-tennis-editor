import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => {
  const off = vi.fn();
  return {
    off,
    // wiring surface
    onWorkspaceDiscovered: vi.fn(() => off),
    onSearchProgress: vi.fn(() => off),
    onSearchHit: vi.fn(() => off),
    onEntrySaved: vi.fn(() => off),
    onExtractProgress: vi.fn(() => off),
    setBackup: vi.fn(() => Promise.resolve()),
    setDirtyCount: vi.fn(() => Promise.resolve()),
    // stores' api surface (they import the barrel)
    openWorkspace: vi.fn(),
    openExe: vi.fn(),
    listEntries: vi.fn(),
    readEntry: vi.fn(),
    saveEntry: vi.fn(),
    previewImage: vi.fn(),
    searchAll: vi.fn(),
    extract: vi.fn(),
  };
});

vi.mock("./api", async () => {
  const errors = await import("./api/errors"); // real normalisation stays covered
  return { ...apiMock, ...errors };
});

const runtimeMock = vi.hoisted(() => ({
  OpenFile: vi.fn(() => Promise.resolve("")),
  Question: vi.fn(() => Promise.resolve("Cancel")),
  Clipboard: { SetText: vi.fn(() => Promise.resolve()) },
  Window: { SetSize: vi.fn(() => Promise.resolve()) },
}));
vi.mock("@wailsio/runtime", () => ({
  Dialogs: { OpenFile: runtimeMock.OpenFile, Question: runtimeMock.Question },
  Clipboard: runtimeMock.Clipboard,
  Window: runtimeMock.Window,
}));

import App from "./App";
import { useAppStore } from "./state/appStore";
import type { BufferDoc } from "./state/bufferStore";
import { useBufferStore } from "./state/bufferStore";
import { useExeStore } from "./state/exeStore";
import { useSearchStore } from "./state/searchStore";
import { useSettingsStore } from "./state/settingsStore";
import { useToastStore } from "./state/toastStore";
import { useWorkspaceStore } from "./state/workspaceStore";

beforeEach(() => {
  vi.clearAllMocks(); // clears calls, keeps vi.fn implementations
  localStorage.clear();
  useAppStore.setState({ mode: "workspace" });
  useSettingsStore.setState({
    backupBeforeWrite: true,
    defaultExtractDest: "",
    searchScope: "all",
  });
  useWorkspaceStore.setState({
    root: "",
    archives: [],
    entries: {},
    expanded: {},
    discovery: null,
    extractProgress: null,
    loading: false,
    error: null,
  });
  useBufferStore.setState({ buffers: [], activeId: null });
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
  useToastStore.setState({ toasts: [] });
});

describe("App shell", () => {
  it("renders toolbar, empty state, search input and status bar", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: /back to picker/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Global search")).toBeInTheDocument();
    expect(
      screen.getByText(/open a workspace to browse the res archives/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText("no workspace").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
  });

  it("subscribes the five events and unsubscribes on unmount", () => {
    const { unmount } = render(<App />);
    expect(apiMock.onWorkspaceDiscovered).toHaveBeenCalledTimes(1);
    expect(apiMock.onSearchProgress).toHaveBeenCalledTimes(1);
    expect(apiMock.onSearchHit).toHaveBeenCalledTimes(1);
    expect(apiMock.onEntrySaved).toHaveBeenCalledTimes(1);
    expect(apiMock.onExtractProgress).toHaveBeenCalledTimes(1);
    unmount();
    expect(apiMock.off).toHaveBeenCalledTimes(5);
  });

  it("pushes the persisted backup setting to Go at startup", () => {
    render(<App />);
    expect(apiMock.setBackup).toHaveBeenCalledWith(true);
  });

  it("resizes the window to the mode's fit on mount", async () => {
    // beforeEach parks mode in workspace → the fixed default size.
    render(<App />);
    await waitFor(() =>
      expect(runtimeMock.Window.SetSize).toHaveBeenCalledWith(1280, 840),
    );
  });

  it("workspace failures replace the empty state with the error", () => {
    render(<App />);
    act(() => {
      useWorkspaceStore.setState({ error: { code: "io", message: "root missing" } });
    });
    expect(screen.getByText("root missing")).toBeInTheDocument();
    expect(screen.queryByText(/open a workspace to browse/i)).toBeNull();
  });

  it("settings dialog opens, toggles the backup mirror, and closes", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    expect(screen.getByRole("dialog", { name: /settings/i })).toBeInTheDocument();

    const checkbox = screen.getByLabelText(/keep a \.bak copy/i);
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    await waitFor(() => expect(apiMock.setBackup).toHaveBeenLastCalledWith(false));

    fireEvent.click(screen.getByRole("button", { name: /close settings/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("toasts render and dismiss", () => {
    render(<App />);
    act(() => {
      useToastStore.getState().push("error", "extract failed");
    });
    expect(screen.getByText("extract failed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText("extract failed")).toBeNull();
  });

  it("status bar reflects the active buffer and dirty count", () => {
    render(<App />);
    const doc: BufferDoc = {
      id: "A.res::b.set",
      archive: "A.res",
      entry: "b.set",
      kind: "set",
      content: null,
      loading: false,
      error: null,
      text: "<a/>",
      raw: "<a/>",
      dirty: true,
      saving: false,
      saveError: null,
      revision: null,
      scrollLine: null,
    };
    act(() => {
      useBufferStore.setState({ buffers: [doc], activeId: doc.id });
    });
    expect(screen.getByText("A.res/b.set")).toBeInTheDocument();
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    expect(screen.getByText("1 dirty")).toBeInTheDocument();
  });

  it("search input feeds the debounced query", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Global search"), {
      target: { value: "gui" },
    });
    expect(useSearchStore.getState().query).toBe("gui");
  });

  it("launch renders the picker and opens nothing", () => {
    useAppStore.setState({ mode: "picker" });
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "FantaTennis Editor" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /select resource folder/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /select exe/i })).toBeInTheDocument();
    expect(apiMock.openWorkspace).not.toHaveBeenCalled();
    expect(apiMock.openExe).not.toHaveBeenCalled();
  });

  it("mode exe renders the exe panel", () => {
    useAppStore.setState({ mode: "exe" });
    useExeStore.setState({ path: "/g/FantaTennis.exe" });
    render(<App />);
    expect(screen.getByText("/g/FantaTennis.exe")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /back to picker/i }),
    ).toBeInTheDocument();
  });
});
