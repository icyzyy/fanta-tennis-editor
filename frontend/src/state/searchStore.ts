import { create } from "zustand";
import * as api from "../api";
import type {
  CancellableSearch,
  ProgressNotice,
  SearchHit,
  SearchRequest,
  SearchSummary,
} from "../api";
import { useSettingsStore } from "./settingsStore";
import { useWorkspaceStore } from "./workspaceStore";

let runSeq = 0; // guards state writes from superseded runs

interface SearchState {
  query: string;
  hits: SearchHit[];
  warnings: SearchHit[];
  progress: ProgressNotice | null;
  running: boolean;
  summary: SearchSummary | null;
  error: string | null;
  inflight: CancellableSearch | null;
  setQuery: (q: string) => void;
  run: (currentArchive?: string) => Promise<void>;
  cancel: () => void;
  addHit: (h: SearchHit) => void;
  setProgress: (n: ProgressNotice) => void;
  clear: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: "",
  hits: [],
  warnings: [],
  progress: null,
  running: false,
  summary: null,
  error: null,
  inflight: null,

  // Stores the typed query only — searching runs on explicit confirm
  // (Enter or the Search button) via run(). Clearing the input still
  // cancels and wipes any previous results.
  setQuery: (q) => {
    set({ query: q });
    if (!q.trim()) {
      get().cancel();
      set({
        hits: [],
        warnings: [],
        summary: null,
        progress: null,
        error: null,
        running: false,
      });
      return;
    }
  },

  run: async (currentArchive) => {
    const { query } = get();
    if (!query.trim()) return;
    get().cancel(); // abort any previous run
    const runId = ++runSeq;
    set({
      running: true,
      hits: [],
      warnings: [],
      summary: null,
      error: null,
      progress: null,
    });
    const scope = useSettingsStore.getState().searchScope;
    const root = useWorkspaceStore.getState().root;
    const req: SearchRequest = {
      root,
      archive: scope === "archive" ? (currentArchive ?? "") : "",
      query: query.trim(),
      caseSensitive: false, // spec §1: case-insensitive search
    };
    const p = api.searchAll(req);
    set({ inflight: p });
    try {
      const summary = await p;
      if (runId !== runSeq) return; // superseded by a newer run
      set({ running: false, summary, inflight: null });
    } catch (e) {
      if (runId !== runSeq) return;
      set({ running: false, inflight: null });
      if (!api.isCancel(e)) set({ error: api.toAppError(e).message });
    }
  },

  cancel: () => {
    const { inflight } = get();
    if (inflight) {
      inflight.cancel();
      set({ inflight: null, running: false });
    }
  },

  addHit: (h) =>
    set((s) => (h.warning ? { warnings: [...s.warnings, h] } : { hits: [...s.hits, h] })),

  setProgress: (n) => set({ progress: n }),

  clear: () => {
    get().cancel();
    runSeq++; // orphan any awaiting run
    set({
      query: "",
      hits: [],
      warnings: [],
      progress: null,
      running: false,
      summary: null,
      error: null,
      inflight: null,
    });
  },
}));
