import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  openWorkspace: vi.fn(),
  listEntries: vi.fn(),
  readEntry: vi.fn(),
  saveEntry: vi.fn(),
  previewImage: vi.fn(),
  searchAll: vi.fn(),
  extract: vi.fn(),
  setDirtyCount: vi.fn(),
  setBackup: vi.fn(),
}));

vi.mock("../api", async () => {
  const errors = await import("../api/errors"); // zero-import module
  return { ...apiMock, ...errors };
});

import { useWorkspaceStore } from "./workspaceStore";

beforeEach(() => {
  vi.clearAllMocks();
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
});

describe("workspaceStore", () => {
  it("openWorkspace stores root + archives and resets caches", async () => {
    apiMock.openWorkspace.mockResolvedValue({
      root: "/r",
      archives: [{ path: "/r/A.res", size: 10, modTime: 1 }],
    });
    await useWorkspaceStore.getState().openWorkspace("/r");
    const s = useWorkspaceStore.getState();
    expect(s.root).toBe("/r");
    expect(s.archives).toHaveLength(1);
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
    expect(apiMock.openWorkspace).toHaveBeenCalledWith("/r");
  });

  it("openWorkspace failures land in the banner as a structured error", async () => {
    apiMock.openWorkspace.mockRejectedValue(
      Object.assign(new Error("nope"), { cause: { code: "io", message: "root missing" } }),
    );
    await useWorkspaceStore.getState().openWorkspace("/gone");
    const s = useWorkspaceStore.getState();
    expect(s.loading).toBe(false);
    expect(s.error).toEqual({ code: "io", message: "root missing" });
    expect(s.archives).toHaveLength(0);
  });

  it("toggleArchive loads entries lazily and caches them", async () => {
    apiMock.listEntries.mockResolvedValue([{ name: "a.set", kind: "set" }]);
    await useWorkspaceStore.getState().toggleArchive("/r/A.res");
    let s = useWorkspaceStore.getState();
    expect(s.expanded["/r/A.res"]).toBe(true);
    expect(s.entries["/r/A.res"]).toHaveLength(1);
    expect(apiMock.listEntries).toHaveBeenCalledTimes(1);

    await useWorkspaceStore.getState().toggleArchive("/r/A.res"); // collapse
    expect(useWorkspaceStore.getState().expanded["/r/A.res"]).toBe(false);

    await useWorkspaceStore.getState().toggleArchive("/r/A.res"); // re-expand
    expect(apiMock.listEntries).toHaveBeenCalledTimes(1); // cached
  });

  it("toggleDir flips a directory's expansion state", () => {
    useWorkspaceStore.getState().toggleDir("/r/MapRes");
    expect(useWorkspaceStore.getState().expandedDirs["/r/MapRes"]).toBe(true);
    useWorkspaceStore.getState().toggleDir("/r/MapRes");
    expect(useWorkspaceStore.getState().expandedDirs["/r/MapRes"]).toBe(false);
  });

  it("openWorkspace resets expandedDirs from the previous workspace", async () => {
    useWorkspaceStore.setState({ expandedDirs: { "/old/Dir": true } });
    apiMock.openWorkspace.mockResolvedValue({ root: "/new", archives: [] });
    await useWorkspaceStore.getState().openWorkspace("/new");
    expect(useWorkspaceStore.getState().expandedDirs).toEqual({});
  });

  it("closeWorkspace resets to the initial state", () => {
    useWorkspaceStore.setState({
      root: "/r",
      archives: [{ path: "/r/A.res", size: 10, modTime: 1 }],
      entries: {
        "/r/A.res": [
          {
            name: "a.set",
            kind: "set",
            compressedSize: 1,
            uncompressedSize: 1,
            method: 0,
            modTime: 1,
          },
        ],
      },
      expanded: { "/r/A.res": true },
      expandedDirs: { "/r/MapRes": true },
      discovery: { op: "open_workspace", done: 1, total: 2, path: "A.res" },
      extractProgress: { op: "extract", done: 1, total: 2, path: "A.set" },
      loading: true,
      error: { code: "io", message: "boom" },
    });
    useWorkspaceStore.getState().closeWorkspace();
    const s = useWorkspaceStore.getState();
    expect(s.root).toBe("");
    expect(s.archives).toEqual([]);
    expect(s.entries).toEqual({});
    expect(s.expanded).toEqual({});
    expect(s.expandedDirs).toEqual({});
    expect(s.discovery).toBeNull();
    expect(s.extractProgress).toBeNull();
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  it("progress setters feed the status bar", () => {
    const notice = { op: "open_workspace", done: 3, total: 9, path: "A.res" };
    useWorkspaceStore.getState().setDiscovery(notice);
    expect(useWorkspaceStore.getState().discovery).toEqual(notice);
    useWorkspaceStore.getState().setDiscovery(null);
    expect(useWorkspaceStore.getState().discovery).toBeNull();
    const ex = { op: "extract", done: 1, total: 2, path: "/tmp/A.set" };
    useWorkspaceStore.getState().setExtractProgress(ex);
    expect(useWorkspaceStore.getState().extractProgress).toEqual(ex);
  });
});
