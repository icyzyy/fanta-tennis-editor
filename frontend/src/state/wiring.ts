import { useEffect } from "react";
import * as api from "../api";
import { useBufferStore } from "./bufferStore";
import { useSearchStore } from "./searchStore";
import { useSettingsStore } from "./settingsStore";
import { useWorkspaceStore } from "./workspaceStore";

/**
 * App-level glue (spec §4): routes the five Wails events to their store
 * actions and re-applies the persisted backup setting at startup.
 * Called exactly once from App. The dirty-buffer count push lives inside
 * bufferStore actions (only when the count changes) — not here.
 */
export function useAppWiring(): void {
  useEffect(() => {
    const offs = [
      api.onWorkspaceDiscovered((n) =>
        useWorkspaceStore.getState().setDiscovery(n),
      ),
      api.onExtractProgress((n) =>
        useWorkspaceStore.getState().setExtractProgress(n),
      ),
      api.onSearchProgress((n) => useSearchStore.getState().setProgress(n)),
      api.onSearchHit((h) => useSearchStore.getState().addHit(h)),
      api.onEntrySaved((s) =>
        useBufferStore.getState().markSaved(s.archive, s.entry, s.revision),
      ),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  useEffect(() => {
    // Go's repo starts with backup ON; the persisted value may differ.
    void api.setBackup(useSettingsStore.getState().backupBeforeWrite);
  }, []);
}
