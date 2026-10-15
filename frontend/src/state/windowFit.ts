import { Window } from "@wailsio/runtime";
import type { AppMode } from "./appStore";

/**
 * Window-fits-content: every mode resizes the window to its content
 * (main.go's 1280x840 stays only the launch size). Sizes are measured from
 * the live DOM, so display scaling can't desync them; `Window.SetSize` takes
 * the OUTER window size, hence the titlebar/border delta (outer - inner) is
 * added on top of content sizes.
 */
export interface WindowMeasure {
  /** outerWidth - innerWidth (titlebar/borders), CSS px */
  chromeW: number;
  chromeH: number;
  /** picker title + buttons block (#picker-fit) */
  pickerW: number;
  pickerH: number;
  /** exe header, summed settings rows, settings vertical padding */
  exeHeaderH: number;
  exeRowsH: number;
  exeSettingsPad: number;
  /** screen.availHeight; 0 = unknown (skip clamp) */
  availH: number;
}

const WORKSPACE_W = 1280;
const WORKSPACE_H = 840;
const EXE_W = 1280;
const PICKER_PAD_X = 48; // free space around the picker block
const PICKER_PAD_Y = 56;
const MIN_W = 420;
const MIN_H = 240;

/** Pure size policy — unit-tested without a DOM. */
export function computeWindowSize(
  mode: AppMode,
  m: WindowMeasure,
): { w: number; h: number } {
  let w: number;
  let h: number;
  if (mode === "workspace") {
    // Fixed default: the editor needs the big canvas regardless of content.
    w = WORKSPACE_W;
    h = WORKSPACE_H;
  } else if (mode === "exe") {
    // Rows are designed full-width; only the height follows the settings.
    w = EXE_W;
    h = m.exeHeaderH + m.exeRowsH + m.exeSettingsPad + m.chromeH;
  } else {
    w = m.pickerW + PICKER_PAD_X * 2 + m.chromeW;
    h = m.pickerH + PICKER_PAD_Y * 2 + m.chromeH;
  }
  w = Math.max(w, MIN_W);
  h = Math.max(h, MIN_H);
  // Content modes never grow taller than the screen; the fixed workspace
  // size mirrors main.go's launch window and is not clamped.
  if (mode !== "workspace" && m.availH > 0) h = Math.min(h, m.availH);
  return { w, h };
}

/** DOM reads; elements of other modes are absent and measure as 0. */
export function readMeasure(): WindowMeasure {
  const picker = document.getElementById("picker-fit");
  const header = document.getElementById("exe-header");
  const settings = document.getElementById("exe-settings");
  let exeRowsH = 0;
  let exeSettingsPad = 0;
  if (settings) {
    // scrollHeight would report the *visible* box while unscrolled, so sum
    // the rows explicitly; padding via computed style stays honest.
    exeSettingsPad =
      parseFloat(getComputedStyle(settings).paddingTop) +
      parseFloat(getComputedStyle(settings).paddingBottom);
    for (const child of Array.from(settings.children)) {
      if (child instanceof HTMLElement) exeRowsH += child.offsetHeight;
    }
  }
  return {
    chromeW: Math.max(window.outerWidth - window.innerWidth, 0),
    chromeH: Math.max(window.outerHeight - window.innerHeight, 0),
    pickerW: picker?.offsetWidth ?? 0,
    pickerH: picker?.offsetHeight ?? 0,
    exeHeaderH: header?.offsetHeight ?? 0,
    exeRowsH,
    exeSettingsPad,
    availH: window.screen?.availHeight ?? 0,
  };
}

/** Resize the window to fit `mode`'s content (no-op outside a Wails runtime). */
export async function fitWindow(mode: AppMode): Promise<void> {
  if (typeof Window?.SetSize !== "function") return;
  const { w, h } = computeWindowSize(mode, readMeasure());
  await Window.SetSize(w, h);
}
