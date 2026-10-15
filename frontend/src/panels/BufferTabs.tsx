import { Dialogs } from "@wailsio/runtime";
import { Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useBufferStore, type BufferDoc } from "../state/bufferStore";

interface TabMenu {
  x: number;
  y: number;
  /** The right-clicked tab; null when the strip background was clicked. */
  keepId: string | null;
}

export function BufferTabs() {
  const buffers = useBufferStore((s) => s.buffers);
  const activeId = useBufferStore((s) => s.activeId);
  const activate = useBufferStore((s) => s.activate);
  const close = useBufferStore((s) => s.close);
  const closeOthers = useBufferStore((s) => s.closeOthers);
  const clear = useBufferStore((s) => s.clear);
  const save = useBufferStore((s) => s.save);
  const [menu, setMenu] = useState<TabMenu | null>(null);

  // Dismiss the context menu on outside click or Escape — same pattern as
  // the workspace tree's menu.
  useEffect(() => {
    if (!menu) return;
    const dismiss = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("click", dismiss);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", dismiss);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  if (buffers.length === 0) return null;
  const active = buffers.find((b) => b.id === activeId) ?? null;

  const requestClose = async (b: BufferDoc) => {
    if (b.dirty) {
      const answer = await Dialogs.Question({
        Title: "Unsaved changes",
        Message: `Discard unsaved changes to ${b.entry}?`,
        // Button[] objects, not strings (verified @wailsio/runtime typings);
        // Question resolves with the chosen Label.
        Buttons: [
          { Label: "Keep editing", IsDefault: true, IsCancel: true },
          { Label: "Discard" },
        ],
      });
      if (answer !== "Discard") return;
    }
    close(b.id);
  };

  /** One native confirm covering N dirty buffers; true = discard them. */
  const confirmDiscard = async (n: number): Promise<boolean> => {
    const answer = await Dialogs.Question({
      Title: "Unsaved changes",
      Message: `Discard unsaved changes to ${n === 1 ? "1 file" : `${n} files`}?`,
      Buttons: [
        { Label: "Keep editing", IsDefault: true, IsCancel: true },
        { Label: "Discard" },
      ],
    });
    return answer === "Discard";
  };

  const handleCloseAll = async () => {
    setMenu(null);
    const dirty = useBufferStore
      .getState()
      .buffers.filter((b) => b.dirty).length;
    if (dirty > 0 && !(await confirmDiscard(dirty))) return;
    clear();
  };

  const handleCloseOthers = async (keepId: string) => {
    setMenu(null);
    const dirty = useBufferStore
      .getState()
      .buffers.filter((b) => b.dirty && b.id !== keepId).length;
    if (dirty > 0 && !(await confirmDiscard(dirty))) return;
    closeOthers(keepId);
  };

  return (
    <>
      <div
        role="tablist"
        aria-label="Open buffers"
        className="flex items-center gap-px overflow-x-auto border-b border-white/10 bg-[#151515] px-1 pt-1"
        onContextMenu={(e) => {
          e.preventDefault();
          const tab = (e.target as HTMLElement).closest("[data-tab-id]");
          setMenu({
            x: e.clientX,
            y: e.clientY,
            keepId: tab?.getAttribute("data-tab-id") ?? null,
          });
        }}
      >
        {buffers.map((b) => {
          const isActive = b.id === activeId;
          return (
            <div
              key={b.id}
              role="tab"
              aria-selected={isActive}
              data-tab-id={b.id}
              onClick={() => activate(b.id)}
              className={`flex cursor-pointer items-center gap-1.5 rounded-t px-3 py-1.5 text-xs ${
                isActive
                  ? "bg-[#0a0a0a] text-gray-100"
                  : "text-gray-500 hover:bg-white/5"
              }`}
            >
              <span className="max-w-40 truncate">{b.entry}</span>
              {b.dirty && (
                <span
                  aria-label="unsaved"
                  className="h-1.5 w-1.5 rounded-full bg-amber-400"
                />
              )}
              <button
                type="button"
                aria-label={`Close ${b.entry}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void requestClose(b);
                }}
                className="rounded p-0.5 opacity-60 hover:bg-white/10 hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
        {active && active.kind === "set" && active.dirty && (
          <button
            type="button"
            aria-label="Save"
            onClick={() => void save(active.id)}
            disabled={active.saving}
            className="ml-auto flex items-center gap-1.5 rounded px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {active.saving ? "Saving…" : "Save"}
          </button>
        )}
      </div>
      {menu && (
        <div
          role="menu"
          className="fixed z-50 w-44 rounded border border-white/10 bg-[#1e1e1e] py-1 shadow-xl"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-1 text-left text-xs text-gray-300 hover:bg-white/5"
            onClick={() => void handleCloseAll()}
          >
            <X className="h-3.5 w-3.5" /> Close all tabs
          </button>
          {menu.keepId !== null && buffers.length > 1 && (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-1 text-left text-xs text-gray-300 hover:bg-white/5"
              onClick={() => {
                const keep = menu.keepId;
                if (keep) void handleCloseOthers(keep);
              }}
            >
              <X className="h-3.5 w-3.5" /> Close other tabs
            </button>
          )}
        </div>
      )}
    </>
  );
}
