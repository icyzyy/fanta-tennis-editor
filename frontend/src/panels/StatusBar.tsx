import { useBufferStore } from "../state/bufferStore";
import { useSearchStore } from "../state/searchStore";
import { useWorkspaceStore } from "../state/workspaceStore";

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

export function StatusBar() {
  const root = useWorkspaceStore((s) => s.root);
  const archiveCount = useWorkspaceStore((s) => s.archives.length);
  const discovery = useWorkspaceStore((s) => s.discovery);
  const extractProgress = useWorkspaceStore((s) => s.extractProgress);
  const buffers = useBufferStore((s) => s.buffers);
  const activeId = useBufferStore((s) => s.activeId);
  const searchRunning = useSearchStore((s) => s.running);
  const searchHits = useSearchStore((s) => s.hits.length);
  const summary = useSearchStore((s) => s.summary);

  const active = buffers.find((b) => b.id === activeId);
  const dirty = buffers.filter((b) => b.dirty).length;

  // Loudest-progress-wins: extraction > discovery > search.
  const progress = extractProgress
    ? `extracting ${extractProgress.done}/${extractProgress.total}`
    : discovery
      ? `discovered ${discovery.done}/${discovery.total}`
      : searchRunning
        ? `searching… ${searchHits} hits`
        : summary && !summary.cancelled
          ? `${summary.hits} hits · ${summary.warnings} warnings`
          : null;

  return (
    <footer className="flex items-center gap-4 border-t border-white/10 bg-[#151515] px-3 py-1 text-xs text-gray-400">
      <span>{root ? `${archiveCount} archives` : "no workspace"}</span>
      {active && (
        <span className="max-w-96 truncate font-mono text-gray-300">
          {basename(active.archive)}/{active.entry}
        </span>
      )}
      {active &&
        (active.dirty ? (
          <span className="text-amber-400">unsaved</span>
        ) : active.revision != null ? (
          <span className="text-emerald-400">saved ✓</span>
        ) : null)}
      {dirty > 0 && <span className="text-amber-400">{dirty} dirty</span>}
      {progress && <span className="ml-auto text-gray-400">{progress}</span>}
    </footer>
  );
}
