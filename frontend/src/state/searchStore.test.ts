import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { useSearchStore } from "./searchStore";
import { useSettingsStore } from "./settingsStore";
import { useWorkspaceStore } from "./workspaceStore";

/**
 * A genuinely pending cancellable promise — resolved ones would settle
 * during advanceTimersByTimeAsync, hiding the state under test.
 * .cancel() rejects with CancelError, like the runtime does.
 */
function pendingCancellable() {
  let resolve!: (v: unknown) => void;
  let reject!: (e: unknown) => void;
  const base = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const cancel = vi.fn(() => {
    const e = new Error("cancelled");
    e.name = "CancelError";
    reject(e);
  });
  return Object.assign(base, { cancel, resolve, reject });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
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
  useWorkspaceStore.setState({ root: "/r" });
  useSettingsStore.setState({ searchScope: "all" });
});

afterEach(() => {
  useSearchStore.getState().cancel();
  vi.useRealTimers();
});

describe("searchStore", () => {
  it("setQuery only stores the query — no automatic run", async () => {
    const p = pendingCancellable();
    apiMock.searchAll.mockImplementation(() => p as never);
    useSearchStore.getState().setQuery("ab");
    await vi.advanceTimersByTimeAsync(1000);
    expect(apiMock.searchAll).not.toHaveBeenCalled();
    expect(useSearchStore.getState().query).toBe("ab");
    expect(useSearchStore.getState().running).toBe(false);
  });

  it("run() sends root + case-insensitive query", () => {
    const p = pendingCancellable();
    apiMock.searchAll.mockImplementation(() => p as never);
    useSearchStore.getState().setQuery("ab");
    void useSearchStore.getState().run();
    expect(apiMock.searchAll).toHaveBeenCalledWith({
      root: "/r",
      archive: "",
      query: "ab",
      caseSensitive: false,
    });
    expect(useSearchStore.getState().running).toBe(true);
  });

  it("scope=archive narrows to the current archive", async () => {
    const p = pendingCancellable();
    apiMock.searchAll.mockImplementation(() => p as never);
    useSettingsStore.setState({ searchScope: "archive" });
    useSearchStore.getState().setQuery("ab");
    void useSearchStore.getState().run("Gui3.res");
    expect(apiMock.searchAll).toHaveBeenCalledWith(
      expect.objectContaining({ archive: "Gui3.res" }),
    );
  });

  it("empty query cancels timers and clears results", async () => {
    const p = pendingCancellable();
    apiMock.searchAll.mockImplementation(() => p as never);
    useSearchStore.getState().setQuery("ab");
    void useSearchStore.getState().run();
    useSearchStore.getState().addHit({ archive: "A.res", text: "hit" });
    expect(useSearchStore.getState().hits).toHaveLength(1);

    useSearchStore.getState().setQuery("");
    await vi.advanceTimersByTimeAsync(0);
    expect(apiMock.searchAll).toHaveBeenCalledTimes(1); // no second run
    const s = useSearchStore.getState();
    expect(s.query).toBe("");
    expect(s.hits).toHaveLength(0);
    expect(s.running).toBe(false);
    expect(s.error).toBeNull();
  });

  it("run resolves with the summary", async () => {
    const p = pendingCancellable();
    apiMock.searchAll.mockImplementation(() => p as never);
    useSearchStore.getState().setQuery("ab");
    void useSearchStore.getState().run();
    p.resolve({ hits: 7, warnings: 2, cancelled: false });
    await vi.advanceTimersByTimeAsync(0);
    const s = useSearchStore.getState();
    expect(s.summary).toEqual({ hits: 7, warnings: 2, cancelled: false });
    expect(s.running).toBe(false);
    expect(s.inflight).toBeNull();
  });

  it("cancel() aborts the in-flight promise without an error", async () => {
    // A genuinely pending cancellable promise — a resolved one would
    // already be settled and hide the state under test.
    let reject!: (e: unknown) => void;
    const p = Object.assign(
      new Promise<never>((_, rej) => {
        reject = rej;
      }),
      {
        cancel: vi.fn(() => {
          const e = new Error("cancelled");
          e.name = "CancelError";
          reject(e);
        }),
      },
    );
    apiMock.searchAll.mockImplementation(() => p as never);
    useSearchStore.getState().setQuery("ab");
    void useSearchStore.getState().run();
    expect(useSearchStore.getState().running).toBe(true);

    useSearchStore.getState().cancel();
    expect(p.cancel).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0); // let the rejection land
    const s = useSearchStore.getState();
    expect(s.running).toBe(false);
    expect(s.error).toBeNull();
  });

  it("real failures surface as a message; CancelError stays silent", async () => {
    // mockImplementation constructs the rejection inside run(), so the
    // handler is attached in the same tick (no unhandled rejection).
    apiMock.searchAll.mockImplementation(() =>
      Object.assign(Promise.reject(new Error("io boom")), { cancel: vi.fn() }) as never,
    );
    useSearchStore.getState().setQuery("ab");
    void useSearchStore.getState().run();
    await vi.advanceTimersByTimeAsync(0);
    expect(useSearchStore.getState().error).toBe("io boom");

    useSearchStore.getState().clear();
    const cancelErr = new Error("stop");
    cancelErr.name = "CancelError";
    apiMock.searchAll.mockImplementation(() =>
      Object.assign(Promise.reject(cancelErr), { cancel: vi.fn() }) as never,
    );
    useSearchStore.getState().setQuery("cd");
    void useSearchStore.getState().run();
    await vi.advanceTimersByTimeAsync(0);
    expect(useSearchStore.getState().error).toBeNull();
  });

  it("addHit routes warnings apart from hits; setProgress feeds the bar", () => {
    const s = useSearchStore.getState();
    s.addHit({ archive: "A.res", text: "match" });
    s.addHit({ archive: "B.res", warning: "unreadable" });
    const st = useSearchStore.getState();
    expect(st.hits).toHaveLength(1);
    expect(st.warnings).toHaveLength(1);
    st.setProgress({ op: "search", done: 1, total: 1 });
    expect(useSearchStore.getState().progress).toEqual({ op: "search", done: 1, total: 1 });
  });
});
