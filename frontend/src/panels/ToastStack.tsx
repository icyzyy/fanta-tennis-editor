import { X } from "lucide-react";
import { useToastStore } from "../state/toastStore";

const KIND_CLASS: Record<string, string> = {
  success: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
  error: "border-red-500/40 bg-red-500/15 text-red-200",
  info: "border-indigo-500/40 bg-indigo-500/15 text-indigo-200",
};

export function ToastStack() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex items-center gap-3 rounded border px-3 py-2 text-sm shadow-lg ${KIND_CLASS[t.kind]}`}
        >
          <span>{t.message}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismiss(t.id)}
            className="opacity-60 hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
