import { create } from "zustand";
import * as api from "../api";
import type { AppError, ArchiveInfo, Entry, ProgressNotice } from "../api";

interface WorkspaceState {
  root: string;
  archives: ArchiveInfo[];
  entries: Record<string, Entry[]>; // archive path → entries (lazy cache)
  expanded: Record<string, boolean>;
  expandedDirs: Record<string, boolean>; // folder path (normalized) → expanded
  discovery: ProgressNotice | null; // live walk progress (status bar)
  extractProgress: ProgressNotice | null;
  loading: boolean;
  error: AppError | null; // workspace-level failure → banner (spec §4)
  openWorkspace: (root: string) => Promise<void>;
  toggleArchive: (archive: string) => Promise<void>;
  toggleDir: (dir: string) => void;
  setDiscovery: (n: ProgressNotice | null) => void;
  setExtractProgress: (n: ProgressNotice | null) => void;
  clearError: () => void;
  closeWorkspace: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  root: "",
  archives: [],
  entries: {},
  expanded: {},
  expandedDirs: {},
  discovery: null,
  extractProgress: null,
  loading: false,
  error: null,

  openWorkspace: async (root) => {
    set({ loading: true, error: null, discovery: null });
    try {
      const ws = await api.openWorkspace(root);
      set({
        root: ws.root,
        archives: ws.archives,
        entries: {},
        expanded: {},
        expandedDirs: {},
        loading: false,
        discovery: null,
      });
    } catch (e) {
      set({ loading: false, discovery: null, error: api.toAppError(e) });
    }
  },

  toggleArchive: async (archive) => {
    const { expanded, entries } = get();
    const next = !expanded[archive];
    set({ expanded: { ...expanded, [archive]: next } });
    if (!next || entries[archive]) return; // collapse or already cached
    try {
      const list = await api.listEntries(archive);
      set({ entries: { ...get().entries, [archive]: list } });
    } catch (e) {
      set({ error: api.toAppError(e) });
    }
  },

  toggleDir: (dir) =>
    set({ expandedDirs: { ...get().expandedDirs, [dir]: !get().expandedDirs[dir] } }),

  setDiscovery: (n) => set({ discovery: n }),
  setExtractProgress: (n) => set({ extractProgress: n }),
  clearError: () => set({ error: null }),

  // Toolbar "Close workspace": back to the picker with every piece of
  // workspace state at its initial value (spec §242-246).
  closeWorkspace: () =>
    set({
      root: "",
      archives: [],
      entries: {},
      expanded: {},
      expandedDirs: {},
      discovery: null,
      extractProgress: null,
      loading: false,
      error: null,
    }),
}));
