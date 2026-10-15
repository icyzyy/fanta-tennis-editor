import { create } from "zustand";

export type AppMode = "picker" | "workspace" | "exe";
interface AppState {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
}
export const useAppStore = create<AppState>((set) => ({
  mode: "picker", // spec §229-230: nothing auto-opens at launch
  setMode: (mode) => set({ mode }),
}));
