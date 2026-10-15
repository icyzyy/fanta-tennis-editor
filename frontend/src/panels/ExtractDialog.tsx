import { Dialogs } from "@wailsio/runtime";
import { FolderOpen, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import * as api from "../api";
import { useSettingsStore } from "../state/settingsStore";
import { useToastStore } from "../state/toastStore";
import { useWorkspaceStore } from "../state/workspaceStore";

export interface ExtractTarget {
  archive: string;
  entries?: string[]; // omitted/undefined = whole archive
  label: string; // dialog title
}

interface ExtractDialogProps {
  target: ExtractTarget | null;
  onClose: () => void;
}

export function ExtractDialog({ target, onClose }: ExtractDialogProps) {
  const defaultDest = useSettingsStore((s) => s.defaultExtractDest);
  const extractProgress = useWorkspaceStore((s) => s.extractProgress);
  const [dest, setDest] = useState("");
  const [decrypted, setDecrypted] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) {
      setDest(defaultDest);
      setDecrypted(true);
      setBusy(false);
    } else {
      // dialog closed/absent: never leave stale progress in the status bar
      useWorkspaceStore.getState().setExtractProgress(null);
    }
  }, [target, defaultDest]);

  const browse = async () => {
    try {
      const picked = await Dialogs.OpenFile({
        CanChooseFiles: false,
        CanChooseDirectories: true,
        Title: "Extract destination",
      });
      const dir = Array.isArray(picked) ? picked[0] : picked;
      if (dir) setDest(dir);
    } catch {
      // dialog dismissed — keep the current value
    }
  };

  const run = async () => {
    if (!target || !dest.trim() || busy) return;
    setBusy(true);
    try {
      const res = await api.extract({
        archive: target.archive,
        entries: target.entries,
        dest: dest.trim(),
        decrypted,
      });
      const n = res.files.length;
      useToastStore
        .getState()
        .push("success", `Extracted ${n} file${n === 1 ? "" : "s"} to ${dest.trim()}`);
      onClose();
    } catch (e) {
      useToastStore
        .getState()
        .push("error", `Extract failed: ${api.toAppError(e).message}`);
    } finally {
      setBusy(false);
    }
  };

  if (!target) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Extract"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60"
    >
      <div className="w-96 rounded border border-white/10 bg-[#151515] p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="truncate text-sm font-semibold text-gray-200">
            Extract {target.label}
          </h2>
          <button
            type="button"
            aria-label="Close extract dialog"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3">
          <div className="mb-1 text-xs text-gray-400">Destination</div>
          <div className="flex gap-2">
            <input
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              placeholder="/path/to/folder"
              className="min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-2 py-1 text-sm outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={() => void browse()}
              className="flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-xs text-gray-300 hover:bg-white/5"
            >
              <FolderOpen className="h-3.5 w-3.5" /> Browse…
            </button>
          </div>
        </div>

        <label className="mb-4 flex cursor-pointer items-start gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={decrypted}
            onChange={(e) => setDecrypted(e.target.checked)}
            className="mt-0.5"
          />
          <span>Decrypt .set entries (everything else copied as-is)</span>
        </label>

        <div className="flex items-center justify-end gap-2">
          {busy && (
            <span className="mr-auto flex items-center gap-1.5 text-xs text-gray-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {extractProgress
                ? `${extractProgress.done}/${extractProgress.total}`
                : "extracting…"}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-white/10 px-3 py-1 text-xs text-gray-300 hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void run()}
            disabled={!dest.trim() || busy}
            className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? "Extracting…" : "Extract"}
          </button>
        </div>
      </div>
    </div>
  );
}
