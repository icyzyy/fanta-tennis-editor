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
  exportTexturePng: vi.fn(),
  importTexturePng: vi.fn(),
}));

vi.mock("../api", async () => {
  const errors = await import("../api/errors"); // zero-import module
  return { ...apiMock, ...errors };
});

import { useBufferStore } from "./bufferStore";

const ID = "A.res::b.set";

beforeEach(() => {
  vi.clearAllMocks();
  useBufferStore.setState({ buffers: [], activeId: null });
});

describe("bufferStore.open", () => {
  it("loads a .set buffer through readEntry with raw baseline", async () => {
    apiMock.readEntry.mockResolvedValue({ kind: "xml", text: "<a/>" });
    await useBufferStore.getState().open("A.res", "b.set", "set");
    const b = useBufferStore.getState().buffers[0];
    expect(apiMock.readEntry).toHaveBeenCalledWith("A.res", "b.set");
    expect(b.content?.kind).toBe("xml");
    expect(b.text).toBe("<a/>");
    expect(b.raw).toBe("<a/>");
    expect(b.dirty).toBe(false);
    expect(useBufferStore.getState().activeId).toBe(ID);
  });

  it("routes .tex through previewImage", async () => {
    apiMock.previewImage.mockResolvedValue({
      kind: "png",
      data: "AA==",
      texture: { width: 1, height: 1, format: "DXT1" },
    });
    await useBufferStore.getState().open("A.res", "c.tex", "tex");
    expect(apiMock.previewImage).toHaveBeenCalledWith("A.res", "c.tex");
    expect(apiMock.readEntry).not.toHaveBeenCalled();
    expect(useBufferStore.getState().buffers[0].content?.texture?.format).toBe("DXT1");
  });

  it("records open failures as a buffer error", async () => {
    apiMock.readEntry.mockRejectedValue(
      Object.assign(new Error("x"), { cause: { code: "bad_pad", message: "bad pad" } }),
    );
    await useBufferStore.getState().open("A.res", "bad.set", "set");
    const b = useBufferStore.getState().buffers[0];
    expect(b.loading).toBe(false);
    expect(b.error).toEqual({ code: "bad_pad", message: "bad pad" });
  });

  it("reuses an open buffer and applies a requested scroll line", async () => {
    apiMock.readEntry.mockResolvedValue({ kind: "xml", text: "<a/>" });
    await useBufferStore.getState().open("A.res", "b.set", "set");
    await useBufferStore.getState().open("A.res", "b.set", "set", 57);
    expect(apiMock.readEntry).toHaveBeenCalledTimes(1);
    expect(useBufferStore.getState().buffers).toHaveLength(1);
    expect(useBufferStore.getState().buffers[0].scrollLine).toBe(57);
  });
});

describe("bufferStore editing + save", () => {
  it("updateText flips dirty only across the raw baseline and pushes the count", async () => {
    apiMock.readEntry.mockResolvedValue({ kind: "xml", text: "<a/>" });
    await useBufferStore.getState().open("A.res", "b.set", "set");

    useBufferStore.getState().updateText(ID, "<ab/>");
    expect(useBufferStore.getState().buffers[0].dirty).toBe(true);
    expect(apiMock.setDirtyCount).toHaveBeenLastCalledWith(1);

    apiMock.setDirtyCount.mockClear();
    useBufferStore.getState().updateText(ID, "<abc/>"); // still dirty
    expect(apiMock.setDirtyCount).not.toHaveBeenCalled();

    useBufferStore.getState().updateText(ID, "<a/>"); // back to baseline
    expect(useBufferStore.getState().buffers[0].dirty).toBe(false);
    expect(apiMock.setDirtyCount).toHaveBeenLastCalledWith(0);
  });

  it("save sends the current text, stores revision, clears dirty", async () => {
    apiMock.readEntry.mockResolvedValue({ kind: "xml", text: "<a/>" });
    await useBufferStore.getState().open("A.res", "b.set", "set");
    useBufferStore.getState().updateText(ID, "<b/>");
    apiMock.saveEntry.mockResolvedValue({ ok: true, revision: 42 });

    await useBufferStore.getState().save(ID);

    expect(apiMock.saveEntry).toHaveBeenCalledWith({
      archive: "A.res",
      entry: "b.set",
      text: "<b/>",
    });
    const b = useBufferStore.getState().buffers[0];
    expect(b.dirty).toBe(false);
    expect(b.raw).toBe("<b/>");
    expect(b.revision).toBe(42);
    expect(b.saveError).toBeNull();
    expect(apiMock.setDirtyCount).toHaveBeenLastCalledWith(0);
  });

  it("save failures keep dirty and surface an inline error", async () => {
    apiMock.readEntry.mockResolvedValue({ kind: "xml", text: "<a/>" });
    await useBufferStore.getState().open("A.res", "b.set", "set");
    useBufferStore.getState().updateText(ID, "<b/>");
    apiMock.saveEntry.mockRejectedValue(
      Object.assign(new Error("x"), {
        cause: { code: "invalid_xml", message: "line 42: oops", detail: "42" },
      }),
    );

    await useBufferStore.getState().save(ID);

    const b = useBufferStore.getState().buffers[0];
    expect(b.dirty).toBe(true); // still unsaved
    expect(b.saving).toBe(false);
    expect(b.saveError).toEqual({ code: "invalid_xml", message: "line 42: oops", detail: "42" });
  });

  it("save is a no-op for clean or non-set buffers", async () => {
    apiMock.previewImage.mockResolvedValue({ kind: "png", data: "AA==" });
    await useBufferStore.getState().open("A.res", "c.tex", "tex");
    await useBufferStore.getState().save("A.res::c.tex");
    expect(apiMock.saveEntry).not.toHaveBeenCalled();
  });
});

describe("bufferStore close + events", () => {
  it("close removes and falls back to the last buffer; dirty count pushed", async () => {
    apiMock.readEntry.mockResolvedValue({ kind: "xml", text: "<a/>" });
    await useBufferStore.getState().open("A.res", "b.set", "set");
    await useBufferStore.getState().open("A.res", "d.set", "set");
    useBufferStore.getState().updateText("A.res::d.set", "<x/>");

    useBufferStore.getState().close(ID);
    const s = useBufferStore.getState();
    expect(s.buffers.map((b) => b.id)).toEqual(["A.res::d.set"]);
    expect(s.activeId).toBe("A.res::d.set");
    expect(apiMock.setDirtyCount).toHaveBeenLastCalledWith(1);

    useBufferStore.getState().close("A.res::d.set");
    expect(useBufferStore.getState().activeId).toBeNull();
    expect(apiMock.setDirtyCount).toHaveBeenLastCalledWith(0);
  });

  it("clear empties the store and pushes dirty count to zero", async () => {
    apiMock.readEntry.mockResolvedValue({ kind: "xml", text: "<a/>" });
    await useBufferStore.getState().open("A.res", "b.set", "set");
    useBufferStore.getState().updateText(ID, "<x/>");
    apiMock.setDirtyCount.mockClear();

    useBufferStore.getState().clear();
    const s = useBufferStore.getState();
    expect(s.buffers).toHaveLength(0);
    expect(s.activeId).toBeNull();
    expect(apiMock.setDirtyCount).toHaveBeenCalledWith(0);
  });

  it("clear with no dirty buffers does not push", async () => {
    apiMock.readEntry.mockResolvedValue({ kind: "xml", text: "<a/>" });
    await useBufferStore.getState().open("A.res", "b.set", "set");
    apiMock.setDirtyCount.mockClear();

    useBufferStore.getState().clear();
    expect(useBufferStore.getState().buffers).toHaveLength(0);
    expect(apiMock.setDirtyCount).not.toHaveBeenCalled();
  });

  it("markSaved updates revision without touching dirty", async () => {
    apiMock.readEntry.mockResolvedValue({ kind: "xml", text: "<a/>" });
    await useBufferStore.getState().open("A.res", "b.set", "set");
    useBufferStore.getState().updateText(ID, "<b/>");
    useBufferStore.getState().markSaved("A.res", "b.set", 9);
    const b = useBufferStore.getState().buffers[0];
    expect(b.revision).toBe(9);
    expect(b.dirty).toBe(true); // late event must not fake a save
  });

  it("clearSaveError / clearScrollLine reset their fields", async () => {
    apiMock.readEntry.mockResolvedValue({ kind: "xml", text: "<a/>" });
    await useBufferStore.getState().open("A.res", "b.set", "set", 7);
    expect(useBufferStore.getState().buffers[0].scrollLine).toBe(7);
    useBufferStore.getState().clearScrollLine(ID);
    expect(useBufferStore.getState().buffers[0].scrollLine).toBeNull();
  });
});

describe("bufferStore.refreshTex", () => {
  it("reloads an open tex buffer's content after an import", async () => {
    apiMock.previewImage.mockResolvedValueOnce({
      kind: "png",
      data: "AA==",
      texture: { width: 1, height: 1, format: "DXT1" },
    });
    await useBufferStore.getState().open("/r/A.res", "T.tex", "tex");

    apiMock.previewImage.mockResolvedValueOnce({
      kind: "png",
      data: "BB==",
      texture: { width: 1, height: 1, format: "DXT1" },
    });
    await useBufferStore.getState().refreshTex("/r/A.res", "T.tex");

    expect(apiMock.previewImage).toHaveBeenCalledTimes(2);
    const b = useBufferStore.getState().buffers[0];
    expect(b.content?.data).toBe("BB==");
    expect(b.loading).toBe(false);
  });

  it("ignores buffers that are not open", async () => {
    await useBufferStore.getState().refreshTex("/r/none.res", "X.tex");
    expect(apiMock.previewImage).not.toHaveBeenCalled();
  });
});

describe("bufferStore image routing (.dds/.bmp/.tga)", () => {
  it("routes non-tex image extensions through previewImage", async () => {
    apiMock.previewImage.mockResolvedValue({
      kind: "png",
      data: "AA==",
      texture: { width: 60, height: 60, format: "RGBA32" },
    });
    await useBufferStore.getState().open("/r/ETC.res", "BubbleBox_Back.tga", "other");
    expect(apiMock.previewImage).toHaveBeenCalledWith("/r/ETC.res", "BubbleBox_Back.tga");
    expect(apiMock.readEntry).not.toHaveBeenCalled();
    expect(useBufferStore.getState().buffers[0].content?.kind).toBe("png");
  });

  it("routes .dds and .bmp too, regardless of the tree kind", async () => {
    apiMock.previewImage.mockResolvedValue({ kind: "png", data: "AA==" });
    await useBufferStore.getState().open("/r/Stage.res", "TA_Net00.dds", "other");
    await useBufferStore.getState().open("/r/Logo.res", "Logo.bmp", "other");
    expect(apiMock.previewImage).toHaveBeenCalledTimes(2);
    expect(apiMock.readEntry).not.toHaveBeenCalled();
  });

  it("falls back to readEntry when a non-tex image preview fails", async () => {
    apiMock.previewImage.mockRejectedValue(new Error("boom"));
    apiMock.readEntry.mockResolvedValue({ kind: "binary", data: "QUJD", totalBytes: 3 });
    await useBufferStore.getState().open("/r/ETC.res", "Cursor.tga", "other");
    expect(apiMock.readEntry).toHaveBeenCalledWith("/r/ETC.res", "Cursor.tga");
    const b = useBufferStore.getState().buffers[0];
    expect(b.content?.kind).toBe("binary"); // hex/BmpView path
    expect(b.error).toBeNull();
  });

  it("keeps tex preview failures inline without readEntry fallback", async () => {
    apiMock.previewImage.mockRejectedValue(new Error("bad tex"));
    await useBufferStore.getState().open("/r/Gui.res", "Icon.tex", "tex");
    expect(apiMock.readEntry).not.toHaveBeenCalled();
    const b = useBufferStore.getState().buffers[0];
    expect(b.error).not.toBeNull();
  });

  it("non-image extensions still go straight to readEntry", async () => {
    apiMock.readEntry.mockResolvedValue({ kind: "binary", data: "AA==", totalBytes: 1 });
    await useBufferStore.getState().open("/r/Gui.res", "data.dat", "other");
    expect(apiMock.previewImage).not.toHaveBeenCalled();
    expect(apiMock.readEntry).toHaveBeenCalled();
  });
});

describe("bufferStore.closeOthers", () => {
  it("keeps only the target, activates it, and pushes the new dirty count", async () => {
    apiMock.readEntry.mockResolvedValue({ kind: "xml", text: "<a/>" });
    await useBufferStore.getState().open("/r/A.res", "a.set", "set");
    await useBufferStore.getState().open("/r/B.res", "b.set", "set");
    useBufferStore.getState().updateText("/r/B.res::b.set", "<edited/>"); // B dirty
    useBufferStore.getState().closeOthers("/r/A.res::a.set");
    const s = useBufferStore.getState();
    expect(s.buffers).toHaveLength(1);
    expect(s.buffers[0].id).toBe("/r/A.res::a.set");
    expect(s.activeId).toBe("/r/A.res::a.set");
    expect(apiMock.setDirtyCount).toHaveBeenCalledWith(0);
  });

  it("does not touch the dirty count when nothing was dirty", async () => {
    apiMock.readEntry.mockResolvedValue({ kind: "xml", text: "<a/>" });
    await useBufferStore.getState().open("/r/A.res", "a.set", "set");
    await useBufferStore.getState().open("/r/B.res", "b.set", "set");
    useBufferStore.getState().closeOthers("/r/A.res::a.set");
    const s = useBufferStore.getState();
    expect(s.buffers.map((b) => b.id)).toEqual(["/r/A.res::a.set"]);
    expect(s.activeId).toBe("/r/A.res::a.set");
    expect(apiMock.setDirtyCount).not.toHaveBeenCalled();
  });
});
