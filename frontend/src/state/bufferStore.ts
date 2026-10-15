import { create } from "zustand";
import * as api from "../api";
import type { AppError, Content, EntryKind } from "../api";

/** Extensions routed through PreviewImage (reskit imgdecoder). */
const IMAGE_EXTS = [".tex", ".dds", ".bmp", ".tga"];

export interface BufferDoc {
  id: string; // `${archive}::${entry}`
  archive: string;
  entry: string;
  kind: EntryKind; // from the tree listing — drives dispatch + save rules
  content: Content | null; // loaded payload (xml text / png / text / binary)
  loading: boolean;
  error: AppError | null; // open failure → shown in BufferView
  text: string; // current editor text (xml/text buffers)
  raw: string; // last-saved baseline; save sends `text`, then raw := text
  dirty: boolean; // text !== raw
  saving: boolean;
  saveError: AppError | null; // validation/save failure → inline in editor
  revision: number | null;
  scrollLine: number | null; // 1-based target line (search hit → editor)
}

interface BufferState {
  buffers: BufferDoc[];
  activeId: string | null;
  open: (archive: string, entry: string, kind: EntryKind, line?: number) => Promise<void>;
  refreshTex: (archive: string, entry: string) => Promise<void>;
  close: (id: string) => void;
  closeOthers: (id: string) => void;
  clear: () => void;
  activate: (id: string) => void;
  updateText: (id: string, text: string) => void;
  save: (id: string) => Promise<void>;
  clearSaveError: (id: string) => void;
  clearScrollLine: (id: string) => void;
  markSaved: (archive: string, entry: string, revision: number) => void;
  dirtyCount: () => number;
}

function dirtyCountOf(buffers: BufferDoc[]): number {
  return buffers.filter((b) => b.dirty).length;
}

function patch(
  state: BufferState,
  id: string,
  changes: Partial<BufferDoc>,
): BufferDoc[] {
  return state.buffers.map((b) => (b.id === id ? { ...b, ...changes } : b));
}

export const useBufferStore = create<BufferState>((set, get) => ({
  buffers: [],
  activeId: null,

  dirtyCount: () => dirtyCountOf(get().buffers),

  open: async (archive, entry, kind, line) => {
    const id = `${archive}::${entry}`;
    const existing = get().buffers.find((b) => b.id === id);
    if (existing) {
      // already open: activate, apply a fresh scroll target if requested
      set({
        activeId: id,
        buffers: patch(get(), id, line != null ? { scrollLine: line } : {}),
      });
      return;
    }
    const doc: BufferDoc = {
      id,
      archive,
      entry,
      kind,
      content: null,
      loading: true,
      error: null,
      text: "",
      raw: "",
      dirty: false,
      saving: false,
      saveError: null,
      revision: null,
      scrollLine: line ?? null,
    };
    set({ buffers: [...get().buffers, doc], activeId: id });
    try {
      // dispatch by extension (spec §4): every image kind (.tex/.dds/.bmp/.tga)
      // goes through PreviewImage; on failure non-tex leftovers fall back to
      // readEntry (hex/BmpView), while .tex failures stay inline errors.
      const isImage = IMAGE_EXTS.some((x) => entry.toLowerCase().endsWith(x));
      let content: Content;
      if (isImage) {
        try {
          content = await api.previewImage(archive, entry);
        } catch (e) {
          if (kind === "tex") throw e;
          content = await api.readEntry(archive, entry);
        }
      } else {
        content = await api.readEntry(archive, entry);
      }
      const text =
        content.kind === "xml" || content.kind === "text" ? (content.text ?? "") : "";
      set({ buffers: patch(get(), id, { content, text, raw: text, loading: false }) });
    } catch (e) {
      set({ buffers: patch(get(), id, { loading: false, error: api.toAppError(e) }) });
    }
  },

  // Re-decodes an already-open tex buffer (after texture:imported-style
  // replaces). The old content stays visible until the new one arrives.
  refreshTex: async (archive, entry) => {
    const id = `${archive}::${entry}`;
    const b = get().buffers.find((x) => x.id === id);
    if (!b || b.kind !== "tex") return;
    try {
      const content = await api.previewImage(archive, entry);
      if (get().buffers.some((x) => x.id === id)) {
        set({ buffers: patch(get(), id, { content, loading: false, error: null }) });
      }
    } catch (e) {
      if (get().buffers.some((x) => x.id === id)) {
        set({ buffers: patch(get(), id, { loading: false, error: api.toAppError(e) }) });
      }
    }
  },

  close: (id) => {
    const state = get();
    const before = dirtyCountOf(state.buffers);
    const buffers = state.buffers.filter((b) => b.id !== id);
    const activeId =
      state.activeId === id
        ? buffers.length
          ? buffers[buffers.length - 1].id
          : null
        : state.activeId;
    set({ buffers, activeId });
    const after = dirtyCountOf(buffers);
    if (after !== before) void api.setDirtyCount(after);
  },

  // Right-click "Close other tabs": keep exactly one buffer in a single
  // set, activating it, with one dirty-count push like close().
  closeOthers: (id) => {
    const state = get();
    if (!state.buffers.some((b) => b.id === id)) return;
    const before = dirtyCountOf(state.buffers);
    const buffers = state.buffers.filter((b) => b.id === id);
    set({ buffers, activeId: id });
    const after = dirtyCountOf(buffers);
    if (after !== before) void api.setDirtyCount(after);
  },

  // Workspace switch (spec §4) drops every buffer; the Go close-guard must
  // see the dirty count fall to zero.
  clear: () => {
    const before = dirtyCountOf(get().buffers);
    set({ buffers: [], activeId: null });
    if (before !== 0) void api.setDirtyCount(0);
  },

  activate: (id) => set({ activeId: id }),

  updateText: (id, text) => {
    const state = get();
    const before = dirtyCountOf(state.buffers);
    const buffers = state.buffers.map((b) => {
      if (b.id !== id) return b;
      const dirty = text !== b.raw;
      return dirty === b.dirty && !b.saveError
        ? { ...b, text }
        : { ...b, text, dirty, saveError: null };
    });
    set({ buffers });
    const after = dirtyCountOf(buffers);
    if (after !== before) void api.setDirtyCount(after); // not per keystroke
  },

  save: async (id) => {
    const b = get().buffers.find((x) => x.id === id);
    if (!b || !b.dirty || b.kind !== "set") return; // only .set repacks
    const before = dirtyCountOf(get().buffers);
    const sent = b.text;
    set({ buffers: patch(get(), id, { saving: true, saveError: null }) });
    try {
      const res = await api.saveEntry({ archive: b.archive, entry: b.entry, text: sent });
      const now = get().buffers.find((x) => x.id === id);
      set({
        buffers: patch(get(), id, {
          saving: false,
          raw: sent,
          // the user may have typed while the save was in flight
          dirty: now ? now.text !== sent : false,
          revision: res.revision,
          saveError: null,
        }),
      });
      const after = dirtyCountOf(get().buffers);
      if (after !== before) void api.setDirtyCount(after);
    } catch (e) {
      set({ buffers: patch(get(), id, { saving: false, saveError: api.toAppError(e) }) });
    }
  },

  clearSaveError: (id) => set({ buffers: patch(get(), id, { saveError: null }) }),

  clearScrollLine: (id) => set({ buffers: patch(get(), id, { scrollLine: null }) }),

  markSaved: (archive, entry, revision) => {
    const id = `${archive}::${entry}`;
    if (get().buffers.some((b) => b.id === id)) {
      set({ buffers: patch(get(), id, { revision }) });
    }
  },
}));
