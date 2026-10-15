import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { useRef, useState } from "react";
import type { EntryKind, SearchHit } from "../api";
import { useBufferStore } from "../state/bufferStore";
import { useSearchStore } from "../state/searchStore";

/** Search hits don't carry a kind — derive it from the entry name. */
export function kindOfEntry(name: string): EntryKind {
  const lower = name.toLowerCase();
  if (lower.endsWith(".set")) return "set";
  if (lower.endsWith(".tex")) return "tex";
  return "other";
}

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

export function SearchPanel() {
  const query = useSearchStore((s) => s.query);
  const hits = useSearchStore((s) => s.hits);
  const warnings = useSearchStore((s) => s.warnings);
  const running = useSearchStore((s) => s.running);
  const summary = useSearchStore((s) => s.summary);
  const error = useSearchStore((s) => s.error);
  const cancel = useSearchStore((s) => s.cancel);
  const open = useBufferStore((s) => s.open);
  const [collapsed, setCollapsed] = useState(false);
  const parentRef = useRef<HTMLDivElement | null>(null);

  // Hooks (incl. the virtualizer) must run unconditionally — the panel
  // mounts/disappears with the query.
  const virtualizer = useVirtualizer({
    count: hits.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 22,
    overscan: 10,
  });

  const hasAnything =
    running ||
    hits.length > 0 ||
    warnings.length > 0 ||
    summary != null ||
    error != null;
  if (!query.trim() && !hasAnything) return null;

  const navigate = (h: SearchHit) => {
    if (!h.entry) return;
    void open(h.archive, h.entry, kindOfEntry(h.entry), h.line);
  };

  return (
    <div className="border-t border-white/10 bg-[#151515]">
      <div className="flex items-center gap-2 px-3 py-1 text-xs text-gray-400">
        <button
          type="button"
          aria-label={
            collapsed ? "Expand search results" : "Collapse search results"
          }
          onClick={() => setCollapsed(!collapsed)}
          className="rounded p-0.5 hover:bg-white/5"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
        <span className="uppercase tracking-wider text-gray-500">
          Search results
        </span>
        {running ? (
          <span className="flex items-center gap-1 text-gray-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            searching… {hits.length} hits so far
          </span>
        ) : summary ? (
          <span>
            {summary.hits} hits · {summary.warnings} warnings
            {summary.cancelled ? " · cancelled" : ""}
          </span>
        ) : null}
        {error && <span className="text-red-400">{error}</span>}
        <span className="ml-auto max-w-48 truncate text-gray-600">
          “{query}”
        </span>
        {running && (
          <button
            type="button"
            aria-label="Cancel search"
            onClick={cancel}
            className="rounded border border-white/10 px-2 py-0.5 text-gray-300 hover:bg-white/5"
          >
            Cancel
          </button>
        )}
      </div>

      {!collapsed && (
        <div
          ref={parentRef}
          className="max-h-44 overflow-auto border-t border-white/5 bg-black/20"
        >
          {hits.length > 0 ? (
            <div
              className="relative w-full"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualizer.getVirtualItems().map((vi) => {
                const h = hits[vi.index];
                return (
                  <button
                    key={vi.key}
                    data-index={vi.index}
                    ref={virtualizer.measureElement}
                    type="button"
                    onClick={() => navigate(h)}
                    className="absolute left-0 flex w-full items-baseline gap-2 px-3 py-0.5 text-left text-xs hover:bg-white/5"
                    style={{ transform: `translateY(${vi.start}px)` }}
                  >
                    <span className="shrink-0 font-mono text-gray-400">
                      {basename(h.archive)} :: {h.entry ?? "?"}:{h.line ?? "?"}
                    </span>
                    <span className="truncate text-gray-500">
                      {h.text ?? ""}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : running ? null : (
            <p className="px-3 py-2 text-xs text-gray-500">no matches</p>
          )}

          {warnings.length > 0 && (
            <div className="border-t border-white/5">
              {warnings.slice(0, 200).map((w, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 px-3 py-0.5 text-xs text-amber-400"
                >
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {basename(w.archive)}
                    {w.entry ? `/${w.entry}` : ""}: {w.warning}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
