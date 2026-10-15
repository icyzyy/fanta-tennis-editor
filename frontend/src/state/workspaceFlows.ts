import { Dialogs } from "@wailsio/runtime";
import { useAppStore } from "./appStore";
import { useBufferStore } from "./bufferStore";
import { useToastStore } from "./toastStore";
import { useWorkspaceStore } from "./workspaceStore";

/** Save all / Discard / Cancel prompt. Resolves true = safe to proceed. */
export async function confirmDirtyBuffers(message: string): Promise<boolean> {
  const dirty = useBufferStore
    .getState()
    .buffers.filter((b) => b.dirty);
  if (dirty.length > 0) {
    const answer = await Dialogs.Question({
      Title: "Unsaved changes",
      Message: message,
      // Button[] objects, not strings; Question resolves with the
      // chosen Label. Cancel is both the default and the cancel
      // action (Enter picks the safe answer).
      Buttons: [
        { Label: "Cancel", IsDefault: true, IsCancel: true },
        { Label: "Discard changes" },
        { Label: "Save all" },
      ],
    });
    if (answer === "Cancel") return false;
    if (answer === "Save all") {
      for (const b of dirty) {
        await useBufferStore.getState().save(b.id);
      }
      const failed = useBufferStore
        .getState()
        .buffers.filter((b) => b.dirty);
      if (failed.length > 0) {
        // a save failed (e.g. invalid XML) — stay put; the inline
        // saveError is visible in the editor
        return false;
      }
    }
    // Discard (or everything saved): fall through to clear()
  }
  return true;
}

/** Close the workspace back to the picker (spec §242-246): dirty prompt,
 *  then bufferStore.clear() (pushes dirty 0 through the existing path),
 *  workspaceStore.closeWorkspace(), mode → picker. */
export async function closeWorkspaceFlow(): Promise<void> {
  const dirty = useBufferStore
    .getState()
    .buffers.filter((b) => b.dirty);
  if (dirty.length > 0) {
    const proceed = await confirmDirtyBuffers(
      `${dirty.length} buffer(s) have unsaved changes. Save them, discard them, or cancel closing the workspace?`,
    );
    if (!proceed) return;
  }
  useBufferStore.getState().clear();
  useWorkspaceStore.getState().closeWorkspace();
  useAppStore.getState().setMode("picker");
}

/** Select the resource folder (identical to the old Toolbar flow) and
 *  enter workspace mode. Dismissing the dialog does nothing. */
export async function selectResourceFolder(): Promise<void> {
  try {
    const picked = await Dialogs.OpenFile({
      CanChooseFiles: false,
      CanChooseDirectories: true,
      Title: "Select the Res folder",
    });
    const dir = Array.isArray(picked) ? picked[0] : picked;
    if (!dir) return;
    if (dir !== useWorkspaceStore.getState().root) {
      // Spec §4: switching to a different workspace clears the buffer
      // store — dirty buffers get a Save all / Discard / Cancel prompt.
      const dirty = useBufferStore
        .getState()
        .buffers.filter((b) => b.dirty);
      if (dirty.length > 0) {
        const proceed = await confirmDirtyBuffers(
          `${dirty.length} buffer(s) have unsaved changes. Save them, discard them, or cancel the switch?`,
        );
        if (!proceed) return;
      }
      useBufferStore.getState().clear();
    }
    await useWorkspaceStore.getState().openWorkspace(dir);
    useAppStore.getState().setMode("workspace");
  } catch (e) {
    // openWorkspace failures land in the store banner; this is dialog-level
    useToastStore
      .getState()
      .push("error", `Folder dialog failed: ${(e as Error)?.message ?? e}`);
  }
}
