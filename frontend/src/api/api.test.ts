import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  OpenWorkspace,
  ListEntries,
  ReadEntry,
  SaveEntry,
  PreviewImage,
  SearchAll,
  Extract,
  SetDirtyCount,
  SetBackup,
  OpenExe,
  ApplyExeSetting,
} = vi.hoisted(() => ({
  OpenWorkspace: vi.fn(),
  ListEntries: vi.fn(),
  ReadEntry: vi.fn(),
  SaveEntry: vi.fn(),
  PreviewImage: vi.fn(),
  SearchAll: vi.fn(),
  Extract: vi.fn(),
  SetDirtyCount: vi.fn(),
  SetBackup: vi.fn(),
  OpenExe: vi.fn(),
  ApplyExeSetting: vi.fn(),
}));

vi.mock("../../bindings/fanta-tennis-editor/internal/controller", () => ({
  WorkspaceService: { OpenWorkspace, ListEntries },
  EntryService: { ReadEntry, SaveEntry, PreviewImage },
  SearchService: { SearchAll },
  ExtractService: { Extract },
  SessionService: { SetDirtyCount, SetBackup },
  ExePatchService: { OpenExe, ApplyExeSetting },
}));

import { applyExeSetting, openExe } from "./exe";
import { previewImage, readEntry, saveEntry } from "./entries";
import { extract } from "./extract";
import { searchAll } from "./search";
import { setBackup, setDirtyCount } from "./session";
import { listEntries, openWorkspace } from "./workspace";

beforeEach(() => vi.clearAllMocks());

describe("workspace api", () => {
  it("openWorkspace forwards the root and returns the payload", async () => {
    const ws = { root: "/r", archives: [{ path: "/r/A.res", size: 1, modTime: 2 }] };
    OpenWorkspace.mockResolvedValue(ws);
    await expect(openWorkspace("/r")).resolves.toEqual(ws);
    expect(OpenWorkspace).toHaveBeenCalledWith("/r");
  });

  it("listEntries forwards the archive", async () => {
    ListEntries.mockResolvedValue([{ name: "a.set", kind: "set" }]);
    const entries = await listEntries("Gui3.res");
    expect(ListEntries).toHaveBeenCalledWith("Gui3.res");
    expect(entries[0].kind).toBe("set");
  });
});

describe("entry api", () => {
  it("readEntry forwards archive + entry", async () => {
    ReadEntry.mockResolvedValue({ kind: "xml", text: "<a/>" });
    await expect(readEntry("A.res", "b.set")).resolves.toEqual({ kind: "xml", text: "<a/>" });
    expect(ReadEntry).toHaveBeenCalledWith("A.res", "b.set");
  });

  it("saveEntry forwards the request and returns the result", async () => {
    SaveEntry.mockResolvedValue({ ok: true, revision: 7 });
    const req = { archive: "A.res", entry: "b.set", text: "<a/>" };
    await expect(saveEntry(req)).resolves.toEqual({ ok: true, revision: 7 });
    expect(SaveEntry).toHaveBeenCalledWith(req);
  });

  it("previewImage forwards archive + entry", async () => {
    const content = { kind: "png", data: "AA==", texture: { width: 1, height: 2, format: "DXT1" } };
    PreviewImage.mockResolvedValue(content);
    await expect(previewImage("A.res", "c.tex")).resolves.toEqual(content);
    expect(PreviewImage).toHaveBeenCalledWith("A.res", "c.tex");
  });
});

describe("search api", () => {
  it("returns the underlying cancellable promise", async () => {
    const summary = { hits: 2, warnings: 0, cancelled: false };
    const promise = Object.assign(Promise.resolve(summary), { cancel: vi.fn() });
    SearchAll.mockReturnValue(promise);

    const out = searchAll({ root: "/r", query: "x", caseSensitive: false });
    expect(SearchAll).toHaveBeenCalledWith({ root: "/r", query: "x", caseSensitive: false });
    out.cancel();
    expect(promise.cancel).toHaveBeenCalled();
    await expect(out).resolves.toEqual(summary);
  });
});

describe("exe api", () => {
  it("openExe forwards the path and returns the payload", async () => {
    const state = {
      path: "/bin/FantaTennis.exe",
      settings: [
        { id: "refillUrl", label: "Refill URL", value: "", editable: true, reason: "", maxLength: 64 },
      ],
      md5: "",
    };
    OpenExe.mockResolvedValue(state);
    await expect(openExe("/bin/FantaTennis.exe")).resolves.toEqual(state);
    expect(OpenExe).toHaveBeenCalledWith("/bin/FantaTennis.exe");
  });

  it("applyExeSetting forwards id/value/name and returns the payload", async () => {
    const state = {
      path: "/bin/FantaTennis.exe",
      settings: [
        { id: "customDll", label: "Custom DLL load", value: "off", editable: true, reason: "", maxLength: 0, name: "jftse.dll", nameEditable: true, nameReason: "" },
      ],
      md5: "abc123",
    };
    ApplyExeSetting.mockResolvedValue(state);
    await expect(applyExeSetting("customDll", "off", "other.dll")).resolves.toEqual(state);
    expect(ApplyExeSetting).toHaveBeenCalledWith("customDll", "off", "other.dll");
  });
});

describe("extract + session api", () => {
  it("forwards requests verbatim", async () => {
    Extract.mockResolvedValue({ files: ["/tmp/x/a.set"] });
    await expect(
      extract({ archive: "A.res", dest: "/tmp/x", decrypted: true }),
    ).resolves.toEqual({ files: ["/tmp/x/a.set"] });
    expect(Extract).toHaveBeenCalledWith({ archive: "A.res", dest: "/tmp/x", decrypted: true });

    SetDirtyCount.mockResolvedValue(undefined);
    await setDirtyCount(2);
    expect(SetDirtyCount).toHaveBeenCalledWith(2);

    SetBackup.mockResolvedValue(undefined);
    await setBackup(false);
    expect(SetBackup).toHaveBeenCalledWith(false);
  });
});
