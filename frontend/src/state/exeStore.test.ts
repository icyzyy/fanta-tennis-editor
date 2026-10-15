import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  openExe: vi.fn(),
  applyExeSetting: vi.fn(),
}));

vi.mock("../api", async () => {
  const errors = await import("../api/errors"); // zero-import module
  return { ...apiMock, ...errors };
});

import { useExeStore } from "./exeStore";

const refill = {
  id: "refillUrl",
  label: "Refill URL",
  value: "https://a",
  editable: true,
  reason: "",
  maxLength: 64,
  name: "",
  nameEditable: false,
  nameReason: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  useExeStore.setState({
    path: "",
    settings: [],
    md5: "",
    loading: false,
    applying: false,
    error: null,
  });
});

describe("exeStore", () => {
  it("openExe stores path, settings and md5, clears error", async () => {
    useExeStore.setState({ error: { code: "io", message: "stale" } });
    apiMock.openExe.mockResolvedValue({ path: "/bin/FantaTennis.exe", settings: [refill], md5: "" });
    await useExeStore.getState().openExe("/bin/FantaTennis.exe");
    const s = useExeStore.getState();
    expect(apiMock.openExe).toHaveBeenCalledWith("/bin/FantaTennis.exe");
    expect(s.path).toBe("/bin/FantaTennis.exe");
    expect(s.settings).toEqual([refill]);
    expect(s.md5).toBe("");
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  it("openExe failure sets a structured error and rejects", async () => {
    const err = Object.assign(new Error("nope"), {
      cause: { code: "io", message: "not an exe" },
    });
    apiMock.openExe.mockRejectedValue(err);
    await expect(useExeStore.getState().openExe("/bad.exe")).rejects.toBe(err);
    const s = useExeStore.getState();
    expect(s.error).toEqual({ code: "io", message: "not an exe" });
    expect(s.loading).toBe(false);
    expect(s.path).toBe("");
    expect(s.settings).toEqual([]);
  });

  it("apply forwards id/value/name and replaces state with the returned md5", async () => {
    useExeStore.setState({ path: "/bin/FantaTennis.exe", settings: [refill], md5: "" });
    const fresh = { ...refill, value: "https://b" };
    apiMock.applyExeSetting.mockResolvedValue({
      path: "/bin/FantaTennis.exe",
      settings: [fresh],
      md5: "abc123",
    });
    await useExeStore.getState().apply("customDll", "enabled", "other.dll");
    const s = useExeStore.getState();
    expect(apiMock.applyExeSetting).toHaveBeenCalledWith("customDll", "enabled", "other.dll");
    expect(s.settings).toEqual([fresh]);
    expect(s.md5).toBe("abc123");
    expect(s.applying).toBe(false);
    expect(s.error).toBeNull();
  });

  it("apply failure sets the error, rejects, and leaves state untouched", async () => {
    useExeStore.setState({ path: "/bin/FantaTennis.exe", settings: [refill], md5: "old" });
    const err = Object.assign(new Error("nope"), {
      cause: { code: "not_found", message: "unknown setting" },
    });
    apiMock.applyExeSetting.mockRejectedValue(err);
    await expect(useExeStore.getState().apply("customDll", "enabled", "other.dll")).rejects.toBe(err);
    const s = useExeStore.getState();
    expect(s.error).toEqual({ code: "not_found", message: "unknown setting" });
    expect(s.applying).toBe(false);
    expect(s.settings).toEqual([refill]);
    expect(s.md5).toBe("old");
    expect(s.path).toBe("/bin/FantaTennis.exe");
  });

  it("reset returns to the empty state", () => {
    useExeStore.setState({
      path: "/bin/FantaTennis.exe",
      settings: [refill],
      md5: "m",
      loading: true,
      applying: true,
      error: { code: "io", message: "boom" },
    });
    useExeStore.getState().reset();
    const s = useExeStore.getState();
    expect(s.path).toBe("");
    expect(s.settings).toEqual([]);
    expect(s.md5).toBe("");
    expect(s.loading).toBe(false);
    expect(s.applying).toBe(false);
    expect(s.error).toBeNull();
  });

  it("reset() never reuses the previous settings array instance", () => {
    useExeStore.setState({ settings: [refill] });
    useExeStore.getState().reset();
    const first = useExeStore.getState().settings;
    expect(first).toEqual([]);
    // A second reset must hand out a NEW array: the old shared-`initial`
    // implementation returned the same instance every time.
    useExeStore.getState().reset();
    const second = useExeStore.getState().settings;
    expect(second).toEqual([]);
    expect(second).not.toBe(first);
  });
});
