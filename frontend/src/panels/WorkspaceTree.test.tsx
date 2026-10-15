import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  exportTexturePng: vi.fn(),
  importTexturePng: vi.fn(),
}));
vi.mock("../api", async () => {
  const errors = await import("../api/errors");
  return { ...apiMock, ...errors };
});
const runtimeMock = vi.hoisted(() => ({
  Clipboard: { SetText: vi.fn(() => Promise.resolve()) },
  Dialogs: {
    SaveFile: vi.fn(() => Promise.resolve("")),
    OpenFile: vi.fn(() => Promise.resolve("")),
  },
}));
vi.mock("@wailsio/runtime", () => runtimeMock);

import type { Entry } from "../api";
import { useBufferStore } from "../state/bufferStore";
import { useToastStore } from "../state/toastStore";
import { useWorkspaceStore } from "../state/workspaceStore";
import { WorkspaceTree } from "./WorkspaceTree";

const LOGIN: Entry = {
  name: "Gui_Login.set",
  kind: "set",
  compressedSize: 1,
  uncompressedSize: 1,
  method: 0,
  modTime: 0,
};
const TEX: Entry = { ...LOGIN, name: "UI01.tex", kind: "tex" };

beforeEach(() => {
  vi.clearAllMocks();
  useBufferStore.setState({ buffers: [], activeId: null });
  useWorkspaceStore.setState({
    root: "/data/Res",
    archives: [
      { path: "/data/Res/Gui2.res", size: 10, modTime: 0 },
      { path: "/data/Res/Gui3.res", size: 20, modTime: 0 },
    ],
    entries: {},
    expanded: {},
    expandedDirs: {},
    discovery: null,
    extractProgress: null,
    loading: false,
    error: null,
  });
});

describe("WorkspaceTree", () => {
  it("lists the archives (virtualized rows still render)", () => {
    render(<WorkspaceTree />);
    expect(screen.getByText("Gui2.res")).toBeInTheDocument();
    expect(screen.getByText("Gui3.res")).toBeInTheDocument();
  });

  it("expanding an archive loads and shows its entries", async () => {
    apiMock.listEntries.mockResolvedValue([LOGIN, TEX]);
    render(<WorkspaceTree />);
    fireEvent.click(screen.getByText("Gui2.res"));
    expect(await screen.findByText("Gui_Login.set")).toBeInTheDocument();
    expect(screen.getByText("UI01.tex")).toBeInTheDocument();
    expect(apiMock.listEntries).toHaveBeenCalledWith("/data/Res/Gui2.res");
    expect(
      useWorkspaceStore.getState().expanded["/data/Res/Gui2.res"],
    ).toBe(true);
  });

  it("clicking a .set entry opens a buffer through readEntry", async () => {
    apiMock.listEntries.mockResolvedValue([LOGIN, TEX]);
    apiMock.readEntry.mockResolvedValue({ kind: "xml", text: "<a/>" });
    render(<WorkspaceTree />);
    fireEvent.click(screen.getByText("Gui2.res"));
    fireEvent.click(await screen.findByText("Gui_Login.set"));
    expect(apiMock.readEntry).toHaveBeenCalledWith(
      "/data/Res/Gui2.res",
      "Gui_Login.set",
    );
    expect(useBufferStore.getState().activeId).toBe(
      "/data/Res/Gui2.res::Gui_Login.set",
    );
    await waitFor(() =>
      expect(useBufferStore.getState().buffers[0]?.loading).toBe(false),
    );
  });

  it("clicking a .tex entry decodes through previewImage", async () => {
    apiMock.listEntries.mockResolvedValue([TEX]);
    apiMock.previewImage.mockResolvedValue({
      kind: "png",
      data: "AA==",
      texture: { width: 1, height: 1, format: "DXT1" },
    });
    render(<WorkspaceTree />);
    fireEvent.click(screen.getByText("Gui3.res"));
    fireEvent.click(await screen.findByText("UI01.tex"));
    expect(apiMock.previewImage).toHaveBeenCalledWith(
      "/data/Res/Gui3.res",
      "UI01.tex",
    );
    expect(useBufferStore.getState().activeId).toBe(
      "/data/Res/Gui3.res::UI01.tex",
    );
  });

  it("context menu copies the entry path and closes", async () => {
    apiMock.listEntries.mockResolvedValue([LOGIN]);
    render(<WorkspaceTree />);
    fireEvent.click(screen.getByText("Gui2.res"));
    fireEvent.contextMenu(await screen.findByText("Gui_Login.set"));
    fireEvent.click(screen.getByRole("menuitem", { name: /copy path/i }));
    expect(runtimeMock.Clipboard.SetText).toHaveBeenCalledWith(
      "/data/Res/Gui2.res/Gui_Login.set",
    );
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("shows workspace errors with a dismiss button", () => {
    useWorkspaceStore.setState({
      error: { code: "io", message: "root missing" },
    });
    render(<WorkspaceTree />);
    expect(screen.getByRole("alert")).toHaveTextContent("root missing");
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the spec empty state without a workspace", () => {
    useWorkspaceStore.setState({ root: "", archives: [] });
    render(<WorkspaceTree />);
    expect(
      screen.getByText(/open a workspace to browse the res archives/i),
    ).toBeInTheDocument();
  });

  it("context menu extracts a single entry", async () => {
    apiMock.listEntries.mockResolvedValue([LOGIN]);
    const onExtract = vi.fn();
    render(<WorkspaceTree onExtract={onExtract} />);
    fireEvent.click(screen.getByText("Gui2.res"));
    fireEvent.contextMenu(await screen.findByText("Gui_Login.set"));
    fireEvent.click(screen.getByRole("menuitem", { name: /extract/i }));
    expect(onExtract).toHaveBeenCalledWith({
      archive: "/data/Res/Gui2.res",
      entries: ["Gui_Login.set"],
      label: "Gui_Login.set",
    });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("context menu extracts a whole archive", () => {
    const onExtract = vi.fn();
    render(<WorkspaceTree onExtract={onExtract} />);
    fireEvent.contextMenu(screen.getByText("Gui3.res"));
    fireEvent.click(screen.getByRole("menuitem", { name: /extract/i }));
    expect(onExtract).toHaveBeenCalledWith({
      archive: "/data/Res/Gui3.res",
      label: "Gui3.res",
    });
  });
});

describe("WorkspaceTree folder grouping", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      archives: [
        { path: "/data/Res/Ad.res", size: 1, modTime: 0 },
        { path: "/data/Res/MapRes/A.res", size: 2, modTime: 0 },
        { path: "/data/Res/MapRes/DecoRes/B.res", size: 3, modTime: 0 },
      ],
    });
  });

  it("groups archives under folders; all folders start collapsed", () => {
    render(<WorkspaceTree />);
    expect(screen.getByText("Ad.res")).toBeInTheDocument(); // root archive always visible
    expect(screen.getByText("MapRes")).toBeInTheDocument(); // folder row visible
    expect(screen.queryByText("A.res")).toBeNull(); // depth-0 folder collapsed too
    expect(screen.queryByText("B.res")).toBeNull();
  });

  it("clicking a depth-0 folder expands and collapses it", () => {
    render(<WorkspaceTree />);
    fireEvent.click(screen.getByText("MapRes"));
    expect(screen.getByText("A.res")).toBeInTheDocument();
    fireEvent.click(screen.getByText("MapRes"));
    expect(screen.queryByText("A.res")).toBeNull();
  });

  it("clicking a collapsed subfolder expands and collapses it", () => {
    render(<WorkspaceTree />);
    fireEvent.click(screen.getByText("MapRes")); // reveal DecoRes (parent opens)
    fireEvent.click(screen.getByText("DecoRes"));
    expect(screen.getByText("B.res")).toBeInTheDocument();
    expect(
      useWorkspaceStore.getState().expandedDirs["/data/Res/MapRes/DecoRes"],
    ).toBe(true);
    fireEvent.click(screen.getByText("DecoRes"));
    expect(screen.queryByText("B.res")).toBeNull();
  });

  it("archives nested in folders still expand entries and reach the API", async () => {
    apiMock.listEntries.mockResolvedValue([LOGIN]);
    render(<WorkspaceTree />);
    fireEvent.click(screen.getByText("MapRes")); // open the parent folder first
    fireEvent.click(await screen.findByText("A.res"));
    expect(await screen.findByText("Gui_Login.set")).toBeInTheDocument();
    expect(apiMock.listEntries).toHaveBeenCalledWith("/data/Res/MapRes/A.res");
  });
});

describe("WorkspaceTree texture PNG round-trip", () => {
  beforeEach(() => {
    apiMock.listEntries.mockResolvedValue([LOGIN, TEX]);
    useToastStore.setState({ toasts: [] });
  });

  it("offers Export/Import PNG only on tex entries", async () => {
    render(<WorkspaceTree />);
    fireEvent.click(screen.getByText("Gui2.res"));
    fireEvent.contextMenu(await screen.findByText("UI01.tex"));
    expect(
      screen.getByRole("menuitem", { name: /export png/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /import png/i }),
    ).toBeInTheDocument();

    fireEvent.click(document.body); // close the menu
    fireEvent.contextMenu(screen.getByText("Gui_Login.set"));
    expect(screen.queryByRole("menuitem", { name: /export png/i })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /import png/i })).toBeNull();
  });

  it("export PNG prompts for a destination and calls the export API", async () => {
    runtimeMock.Dialogs.SaveFile.mockResolvedValue("/tmp/out.png");
    apiMock.exportTexturePng.mockResolvedValue({ ok: true, dest: "/tmp/out.png" });
    render(<WorkspaceTree />);
    fireEvent.click(screen.getByText("Gui2.res"));
    fireEvent.contextMenu(await screen.findByText("UI01.tex"));
    fireEvent.click(screen.getByRole("menuitem", { name: /export png/i }));
    await waitFor(() =>
      expect(apiMock.exportTexturePng).toHaveBeenCalledWith({
        archive: "/data/Res/Gui2.res",
        entry: "UI01.tex",
        dest: "/tmp/out.png",
      }),
    );
    expect(useToastStore.getState().toasts.some((t) => t.kind === "success")).toBe(true);
  });

  it("import PNG replaces and refreshes the open preview with a toast", async () => {
    apiMock.previewImage.mockResolvedValue({
      kind: "png",
      data: "AA==",
      texture: { width: 1, height: 1, format: "DXT1" },
    });
    await useBufferStore.getState().open("/data/Res/Gui2.res", "UI01.tex", "tex");
    expect(apiMock.previewImage).toHaveBeenCalledTimes(1);

    runtimeMock.Dialogs.OpenFile.mockResolvedValue("/tmp/in.png");
    apiMock.importTexturePng.mockResolvedValue({ ok: true, revision: 5 });
    render(<WorkspaceTree />);
    fireEvent.click(screen.getByText("Gui2.res"));
    fireEvent.contextMenu(await screen.findByText("UI01.tex"));
    fireEvent.click(screen.getByRole("menuitem", { name: /import png/i }));

    await waitFor(() =>
      expect(apiMock.importTexturePng).toHaveBeenCalledWith({
        archive: "/data/Res/Gui2.res",
        entry: "UI01.tex",
        src: "/tmp/in.png",
      }),
    );
    await waitFor(() =>
      expect(apiMock.previewImage).toHaveBeenCalledTimes(2), // open + refresh
    );
    expect(useToastStore.getState().toasts.some((t) => t.kind === "success")).toBe(true);
  });

  it("import failures land in an error toast", async () => {
    runtimeMock.Dialogs.OpenFile.mockResolvedValue("/tmp/bad.png");
    apiMock.importTexturePng.mockRejectedValue(
      Object.assign(new Error("x"), {
        cause: { code: "io", message: "dimension mismatch: got 4x4, want 8x8" },
      }),
    );
    render(<WorkspaceTree />);
    fireEvent.click(screen.getByText("Gui2.res"));
    fireEvent.contextMenu(await screen.findByText("UI01.tex"));
    fireEvent.click(screen.getByRole("menuitem", { name: /import png/i }));
    await waitFor(() =>
      expect(
        useToastStore
          .getState()
          .toasts.some((t) => t.kind === "error" && t.message.includes("dimension mismatch")),
      ).toBe(true),
    );
    expect(apiMock.previewImage).not.toHaveBeenCalled(); // no refresh on failure
  });
});
