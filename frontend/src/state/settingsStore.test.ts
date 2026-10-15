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

import { useSettingsStore } from "./settingsStore";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useSettingsStore.setState({
    backupBeforeWrite: true,
    defaultExtractDest: "",
    searchScope: "all",
  });
});

describe("settingsStore", () => {
  it("defaults: backup on, no extract dest, search all", () => {
    const s = useSettingsStore.getState();
    expect(s.backupBeforeWrite).toBe(true);
    expect(s.defaultExtractDest).toBe("");
    expect(s.searchScope).toBe("all");
  });

  it("backup toggle pushes to Go and persists", () => {
    useSettingsStore.getState().setBackupBeforeWrite(false);
    expect(apiMock.setBackup).toHaveBeenCalledWith(false);
    const stored = JSON.parse(localStorage.getItem("fanta-tennis-settings")!);
    expect(stored.state.backupBeforeWrite).toBe(false);
  });

  it("extract dest and scope persist without Go calls", () => {
    const s = useSettingsStore.getState();
    s.setDefaultExtractDest("/tmp/out");
    s.setSearchScope("archive");
    expect(apiMock.setBackup).not.toHaveBeenCalled();
    const stored = JSON.parse(localStorage.getItem("fanta-tennis-settings")!);
    expect(stored.state.defaultExtractDest).toBe("/tmp/out");
    expect(stored.state.searchScope).toBe("archive");
  });
});
