import { create } from "zustand";
import * as api from "../api";
import type { AppError, ExeSetting } from "../api";

interface ExeStoreState {
  path: string;
  settings: ExeSetting[];
  md5: string; // last successful apply
  loading: boolean; // openExe in flight
  applying: boolean; // apply in flight
  error: AppError | null;
  openExe: (path: string) => Promise<void>;
  apply: (id: string, value: string, name: string) => Promise<void>;
  reset: () => void; // Back to picker clears everything
}

// Factory, not a shared object: each call yields a FRESH settings array so
// an in-place mutation can never leak across resets.
const initialState = () => ({
  path: "",
  settings: [] as ExeSetting[],
  md5: "",
  loading: false,
  applying: false,
  error: null,
});

export const useExeStore = create<ExeStoreState>((set) => ({
  ...initialState(),

  openExe: async (path) => {
    set({ loading: true, error: null });
    try {
      const st = await api.openExe(path);
      set({ path: st.path, settings: st.settings, md5: st.md5 });
    } catch (e) {
      set({ error: api.toAppError(e) });
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  apply: async (id: string, value: string, name: string) => {
    set({ applying: true, error: null });
    try {
      const st = await api.applyExeSetting(id, value, name);
      set({ path: st.path, settings: st.settings, md5: st.md5 });
    } catch (e) {
      set({ error: api.toAppError(e) });
      throw e;
    } finally {
      set({ applying: false });
    }
  },

  reset: () => set(initialState()),
}));
