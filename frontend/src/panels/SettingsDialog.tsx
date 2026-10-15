import { FolderOpen, X } from "lucide-react";
import { Dialogs } from "@wailsio/runtime";
import type { SearchScope } from "../state/settingsStore";
import { useSettingsStore } from "../state/settingsStore";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const backup = useSettingsStore((s) => s.backupBeforeWrite);
  const setBackup = useSettingsStore((s) => s.setBackupBeforeWrite);
  const dest = useSettingsStore((s) => s.defaultExtractDest);
  const setDest = useSettingsStore((s) => s.setDefaultExtractDest);
  const scope = useSettingsStore((s) => s.searchScope);
  const setScope = useSettingsStore((s) => s.setSearchScope);

  if (!open) return null;

  const browse = async () => {
    try {
      const picked = await Dialogs.OpenFile({
        CanChooseFiles: false,
        CanChooseDirectories: true,
        Title: "Default extract destination",
      });
      const dir = Array.isArray(picked) ? picked[0] : picked;
      if (dir) setDest(dir);
    } catch {
      // dialog dismissed/failed — keep the current value
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60"
    >
      <div className="w-96 rounded border border-white/10 bg-[#151515] p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-200">Settings</h2>
          <button
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="mb-4 flex cursor-pointer items-start gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={backup}
            onChange={(e) => setBackup(e.target.checked)}
            className="mt-0.5"
          />
          <span>Keep a .bak copy before the first write of a session</span>
        </label>

        <div className="mb-4">
          <div className="mb-1 text-xs text-gray-400">Default extract destination</div>
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
              <FolderOpen className="h-3.5 w-3.5" />
              Browse…
            </button>
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs text-gray-400">Search scope</div>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as SearchScope)}
            className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-sm outline-none focus:border-indigo-500"
          >
            <option value="all">All archives</option>
            <option value="archive">Current archive only</option>
          </select>
        </div>
      </div>
    </div>
  );
}
