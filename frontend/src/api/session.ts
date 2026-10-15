import { SessionService } from "../../bindings/fanta-tennis-editor/internal/controller";

/**
 * Pushes the dirty-buffer count for the unsaved-exit guard. Best effort:
 * never rejects (a failed push only degrades the warning, never blocks
 * editing), so call sites can `void` it without unhandled rejections.
 */
export async function setDirtyCount(count: number): Promise<void> {
  try {
    await SessionService.SetDirtyCount(count);
  } catch {
    // advisory state — ignore
  }
}

/** Toggles the <archive>.bak copy before the first write of a session. */
export async function setBackup(enabled: boolean): Promise<void> {
  await SessionService.SetBackup(enabled);
}
