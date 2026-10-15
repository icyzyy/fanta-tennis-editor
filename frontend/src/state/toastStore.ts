import { create } from "zustand";

export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  message: string;
  timeout?: ReturnType<typeof setTimeout>;
}

interface ToastState {
  toasts: Toast[];
  push: (kind: Toast["kind"], message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

// Transient notifications (spec §4: transient errors → toast).
export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, message) => {
    const id = nextId++;
    const timeout = setTimeout(() => useToastStore.getState().dismiss(id), 5000);
    set((s) => ({ toasts: [...s.toasts, { id, kind, message, timeout }] }));
  },
  dismiss: (id) =>
    set((s) => {
      const t = s.toasts.find((x) => x.id === id);
      if (t?.timeout) clearTimeout(t.timeout);
      return { toasts: s.toasts.filter((x) => x.id !== id) };
    }),
}));
