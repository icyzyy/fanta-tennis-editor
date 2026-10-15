import { create } from "zustand";
import { persist } from "zustand/middleware";
import * as api from "../api";

export type SearchScope = "all" | "archive";

interface SettingsState {
  backupBeforeWrite: boolean;
  defaultExtractDest: string;
  searchScope: SearchScope;
  setBackupBeforeWrite: (v: boolean) => void;
  setDefaultExtractDest: (v: string) => void;
  setSearchScope: (v: SearchScope) => void;
}

// Persisted user preferences (spec §5 settings). backupBeforeWrite is the
// only one mirrored into Go (reszip.Repo.SetBackup).
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      backupBeforeWrite: true,
      defaultExtractDest: "",
      searchScope: "all",
      setBackupBeforeWrite: (v) => {
        set({ backupBeforeWrite: v });
        void api.setBackup(v);
      },
      setDefaultExtractDest: (v) => set({ defaultExtractDest: v }),
      setSearchScope: (v) => set({ searchScope: v }),
    }),
    { name: "fanta-tennis-settings" },
  ),
);
