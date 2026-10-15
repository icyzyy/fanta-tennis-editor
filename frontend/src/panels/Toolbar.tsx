import { ArrowLeft, Loader2, Search, Settings, X } from "lucide-react";
import { useBufferStore } from "../state/bufferStore";
import { useSearchStore } from "../state/searchStore";
import { useWorkspaceStore } from "../state/workspaceStore";
import { closeWorkspaceFlow } from "../state/workspaceFlows";

interface ToolbarProps {
  onOpenSettings: () => void;
}

export function Toolbar({ onOpenSettings }: ToolbarProps) {
  const root = useWorkspaceStore((s) => s.root);
  const loading = useWorkspaceStore((s) => s.loading);
  const query = useSearchStore((s) => s.query);
  const running = useSearchStore((s) => s.running);
  const setQuery = useSearchStore((s) => s.setQuery);
  const run = useSearchStore((s) => s.run);
  const activeArchive = useBufferStore((s) => {
    const active = s.buffers.find((b) => b.id === s.activeId);
    return active?.archive;
  });

  return (
    <header className="flex items-center gap-3 border-b border-white/10 bg-[#151515] px-3 py-2">
      {/* Always shown, even without a workspace: a failed open lands here in
          the empty state, and this button is the only way back to the picker
          (which owns opening). */}
      <button
        type="button"
        onClick={() => void closeWorkspaceFlow()}
        disabled={loading}
        aria-label="Back to picker"
        className="flex items-center gap-2 rounded bg-white/5 px-3 py-1.5 text-sm font-medium text-gray-300 hover:bg-white/10 disabled:opacity-50"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to picker
      </button>

      <span className="max-w-64 truncate font-mono text-xs text-gray-400">
        {root || "no workspace"}
      </span>

      <div className="relative ml-auto flex items-center">
        <button
          type="button"
          aria-label="Search"
          onClick={() => void run(activeArchive)}
          className="absolute left-1.5 rounded p-1 text-gray-500 hover:text-gray-200"
        >
          <Search className="h-4 w-4" />
        </button>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Search only runs on explicit confirm: Enter or the button.
            if (e.key === "Enter") {
              e.preventDefault();
              void run(activeArchive);
            }
          }}
          placeholder="search…"
          aria-label="Global search"
          className="w-64 rounded border border-white/10 bg-black/30 py-1.5 pl-8 pr-8 text-sm outline-none placeholder:text-gray-600 focus:border-indigo-500"
        />
        {running ? (
          <Loader2
            aria-label="searching"
            className="absolute right-2 h-4 w-4 animate-spin text-gray-400"
          />
        ) : query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery("")}
            className="absolute right-1.5 text-gray-500 hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <button
        type="button"
        aria-label="Settings"
        onClick={onOpenSettings}
        className="rounded p-1.5 text-gray-400 hover:bg-white/5 hover:text-gray-200"
      >
        <Settings className="h-4 w-4" />
      </button>
    </header>
  );
}
