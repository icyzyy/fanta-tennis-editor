import { beforeEach, describe, expect, it } from "vitest";

import { useAppStore } from "./appStore";

describe("appStore", () => {
  // Each test asserts against the launch default; without this reset the
  // "starts in picker mode" test only passed when it ran before
  // "setMode switches the mode".
  beforeEach(() => {
    useAppStore.setState({ mode: "picker" });
  });

  it("starts in picker mode", () => {
    expect(useAppStore.getState().mode).toBe("picker");
  });

  it("setMode switches the mode", () => {
    useAppStore.getState().setMode("exe");
    expect(useAppStore.getState().mode).toBe("exe");
    useAppStore.getState().setMode("workspace");
    expect(useAppStore.getState().mode).toBe("workspace");
  });
});
