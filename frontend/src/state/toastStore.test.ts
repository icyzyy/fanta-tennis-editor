import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToastStore } from "./toastStore";

beforeEach(() => {
  vi.useFakeTimers();
  useToastStore.setState({ toasts: [] });
});

afterEach(() => vi.useRealTimers());

describe("toastStore", () => {
  it("push appends and dismiss removes", () => {
    useToastStore.getState().push("success", "saved ✓");
    useToastStore.getState().push("error", "boom");
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual([
      "saved ✓",
      "boom",
    ]);
    const [first] = useToastStore.getState().toasts;
    useToastStore.getState().dismiss(first.id);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it("auto-dismisses after 5s", () => {
    useToastStore.getState().push("info", "extracted 3 files");
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(5000);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
