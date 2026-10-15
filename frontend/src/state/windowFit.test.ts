import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMock = vi.hoisted(() => ({ SetSize: vi.fn(() => Promise.resolve()) }));
vi.mock("@wailsio/runtime", () => ({ Window: runtimeMock }));

import { computeWindowSize, fitWindow, type WindowMeasure } from "./windowFit";

const base: WindowMeasure = {
  chromeW: 16,
  chromeH: 39,
  pickerW: 340,
  pickerH: 110,
  exeHeaderH: 40,
  exeRowsH: 200,
  exeSettingsPad: 24,
  availH: 1000,
};

beforeEach(() => vi.clearAllMocks());

describe("computeWindowSize", () => {
  it("workspace restores the fixed default, ignoring measurement", () => {
    expect(
      computeWindowSize("workspace", {
        ...base,
        chromeW: 0,
        chromeH: 0,
        availH: 0,
      }),
    ).toEqual({ w: 1280, h: 840 });
  });

  it("picker hugs its block plus margins and window chrome", () => {
    // 340 + 2*48 + 16 = 452 ; 110 + 2*56 + 39 = 261
    expect(computeWindowSize("picker", base)).toEqual({ w: 452, h: 261 });
  });

  it("exe fits header + rows + padding + chrome at width 1280", () => {
    // 40 + 200 + 24 + 39 = 303
    expect(computeWindowSize("exe", base)).toEqual({ w: 1280, h: 303 });
  });

  it("enforces the minimum window size", () => {
    const empty: WindowMeasure = {
      ...base,
      chromeW: 0,
      chromeH: 0,
      pickerW: 0,
      pickerH: 0,
      exeHeaderH: 0,
      exeRowsH: 0,
      exeSettingsPad: 0,
    };
    expect(computeWindowSize("picker", empty)).toEqual({ w: 420, h: 240 });
    expect(computeWindowSize("exe", empty)).toEqual({ w: 1280, h: 240 });
  });

  it("content modes clamp to the screen; workspace does not", () => {
    expect(computeWindowSize("exe", { ...base, availH: 200 }).h).toBe(200);
    expect(computeWindowSize("picker", { ...base, availH: 200 }).h).toBe(200);
    expect(computeWindowSize("workspace", { ...base, availH: 200 })).toEqual({
      w: 1280,
      h: 840,
    });
  });
});

describe("fitWindow", () => {
  it("pushes the computed size through Window.SetSize", async () => {
    // jsdom lays nothing out: the picker block measures 0 and clamps to the
    // minimum (chrome deltas are 0 there as well).
    await fitWindow("picker");
    expect(runtimeMock.SetSize).toHaveBeenCalledWith(420, 240);
  });

  it("workspace always resets to the default size", async () => {
    await fitWindow("workspace");
    expect(runtimeMock.SetSize).toHaveBeenCalledWith(1280, 840);
  });

  it("is a no-op when the runtime does not expose Window", async () => {
    vi.resetModules();
    vi.doMock("@wailsio/runtime", () => ({ Window: undefined }));
    const { fitWindow: bare } = await import("./windowFit");
    await expect(bare("picker")).resolves.toBeUndefined();
    expect(runtimeMock.SetSize).not.toHaveBeenCalled();
    vi.doUnmock("@wailsio/runtime");
  });
});
