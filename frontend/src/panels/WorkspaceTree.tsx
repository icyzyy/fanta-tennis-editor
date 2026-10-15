import { Clipboard, Dialogs } from "@wailsio/runtime";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  File,
  FileCode,
  FileImage,
  FileQuestion,
  FileText,
  Folder,
  FolderOpen,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as api from "../api";
import type { ArchiveInfo, Entry } from "../api";
import { useBufferStore } from "../state/bufferStore";
import { useToastStore } from "../state/toastStore";
import { useWorkspaceStore } from "../state/workspaceStore";
import type { ExtractTarget } from "./ExtractDialog";

type TreeRow =
  | { type: "folder"; path: string; name: string; depth: number }
  | { type: "archive"; archive: string; depth: number }
  | { type: "loading"; archive: string; depth: number }
  | { type: "entry"; archive: string; entry: Entry; depth: number };

interface MenuState {
  x: number;
  y: number;
  archive: string;
  entry?: Entry;
}

interface WorkspaceTreeProps {
  /** Context-menu "Extract…" sink — App owns the dialog state. */
  onExtract?: (target: ExtractTarget) => void;
}

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

function stripTrailingSlash(p: string): string {
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

interface DirNode {
  name: string;
  path: string; // normalized directory key (folder rows + expandedDirs key)
  dirs: Map<string, DirNode>;
  archives: string[]; // original archive paths — unchanged for API calls
}

/**
 * Flatten the archive list into virtualized rows that mirror the on-disk
 * folder hierarchy under the workspace root. All folders start collapsed;
 * expandedDirs records the user's toggles (absent = collapsed).
 */
export function buildRows(
  root: string,
  archives: ArchiveInfo[],
  expanded: Record<string, boolean>,
  expandedDirs: Record<string, boolean>,
  entries: Record<string, Entry[]>,
): TreeRow[] {
  const rootNorm = stripTrailingSlash(normalizePath(root));
  const topDirs = new Map<string, DirNode>();
  const topArchives: string[] = [];

  for (const a of archives) {
    const rel = normalizePath(a.path)
      .slice(rootNorm.length)
      .replace(/^\//, "");
    const parts = rel.split("/");
    let parent: DirNode | null = null;
    let key = rootNorm;
    for (let i = 0; i < parts.length - 1; i++) {
      key = `${key}/${parts[i]}`;
      const container = parent ? parent.dirs : topDirs;
      let next = container.get(parts[i]);
      if (!next) {
        next = { name: parts[i], path: key, dirs: new Map(), archives: [] };
        container.set(parts[i], next);
      }
      parent = next;
    }
    if (parent) parent.archives.push(a.path);
    else topArchives.push(a.path);
  }

  const rows: TreeRow[] = [];
  const pushArchive = (ap: string, depth: number) => {
    rows.push({ type: "archive", archive: ap, depth });
    if (!expanded[ap]) return;
    const list = entries[ap];
    if (!list) rows.push({ type: "loading", archive: ap, depth });
    else
      for (const e of list) {
        rows.push({ type: "entry", archive: ap, entry: e, depth });
      }
  };
  const pushDir = (dir: DirNode, depth: number) => {
    rows.push({ type: "folder", path: dir.path, name: dir.name, depth });
    const isOpen = !!expandedDirs[dir.path];
    if (!isOpen) return;
    const children: Array<{ name: string; run: () => void }> = [];
    for (const d of dir.dirs.values())
      children.push({ name: d.name, run: () => pushDir(d, depth + 1) });
    for (const ap of dir.archives)
      children.push({
        name: basename(ap),
        run: () => pushArchive(ap, depth + 1),
      });
    children.sort((x, y) =>
      x.name.toLowerCase().localeCompare(y.name.toLowerCase()),
    );
    for (const c of children) c.run();
  };

  const top: Array<{ name: string; run: () => void }> = [];
  for (const d of topDirs.values())
    top.push({ name: d.name, run: () => pushDir(d, 0) });
  for (const ap of topArchives)
    top.push({ name: basename(ap), run: () => pushArchive(ap, 0) });
  top.sort((x, y) =>
    x.name.toLowerCase().localeCompare(y.name.toLowerCase()),
  );
  for (const t of top) t.run();
  return rows;
}

const indent = (depth: number) => ({ paddingLeft: 8 + depth * 14 });

const PNG_FILTERS = [{ DisplayName: "PNG images (*.png)", Pattern: "*.png" }];

export function WorkspaceTree({ onExtract }: WorkspaceTreeProps) {
  const root = useWorkspaceStore((s) => s.root);
  const archives = useWorkspaceStore((s) => s.archives);
  const entries = useWorkspaceStore((s) => s.entries);
  const expanded = useWorkspaceStore((s) => s.expanded);
  const expandedDirs = useWorkspaceStore((s) => s.expandedDirs);
  const error = useWorkspaceStore((s) => s.error);
  const toggleArchive = useWorkspaceStore((s) => s.toggleArchive);
  const toggleDir = useWorkspaceStore((s) => s.toggleDir);
  const clearError = useWorkspaceStore((s) => s.clearError);
  const open = useBufferStore((s) => s.open);

  const handleExportPng = async (archive: string, entry: string) => {
    try {
      const dest = await Dialogs.SaveFile({ Title: "Export PNG", Filters: PNG_FILTERS });
      const path = Array.isArray(dest) ? dest[0] : dest;
      if (!path) return; // dismissed
      await api.exportTexturePng({ archive, entry, dest: path });
      useToastStore.getState().push("success", `Exported ${basename(path)}`);
    } catch (e) {
      useToastStore.getState().push("error", api.toAppError(e).message);
    }
  };

  const handleImportPng = async (archive: string, entry: string) => {
    try {
      const picked = await Dialogs.OpenFile({
        CanChooseFiles: true,
        CanChooseDirectories: false,
        Title: "Import PNG",
        Filters: PNG_FILTERS,
      });
      const src = Array.isArray(picked) ? picked[0] : picked;
      if (!src) return; // dismissed
      await api.importTexturePng({ archive, entry, src });
      await useBufferStore.getState().refreshTex(archive, entry);
      useToastStore
        .getState()
        .push("success", `Imported ${basename(src)} into ${basename(entry)}`);
    } catch (e) {
      useToastStore.getState().push("error", api.toAppError(e).message);
    }
  };

  const [menu, setMenu] = useState<MenuState | null>(null);
  const parentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const rows = buildRows(root, archives, expanded, expandedDirs, entries);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24,
    overscan: 12,
  });

  const entryIcon = (entry: Entry) => {
    const lower = entry.name.toLowerCase();
    if (entry.kind === "set" || lower.endsWith(".set")) {
      // editable game data
      return <FileCode className="h-3.5 w-3.5 shrink-0 text-emerald-300" />;
    }
    if (entry.kind === "tex" || lower.endsWith(".tex")) {
      // game textures
      return <FileImage className="h-3.5 w-3.5 shrink-0 text-sky-300" />;
    }
    if (
      lower.endsWith(".dds") ||
      lower.endsWith(".tga") ||
      lower.endsWith(".bmp")
    ) {
      // image leftovers — same family as textures, distinct hue
      return <FileImage className="h-3.5 w-3.5 shrink-0 text-violet-300" />;
    }
    if (lower.endsWith(".ftm")) {
      // map / scene chunks
      return <File className="h-3.5 w-3.5 shrink-0 text-amber-300" />;
    }
    if (lower.endsWith(".prj")) {
      // map manifests
      return <FileText className="h-3.5 w-3.5 shrink-0 text-teal-300" />;
    }
    if (lower.endsWith(".dat")) {
      // tile / mesh payloads
      return <File className="h-3.5 w-3.5 shrink-0 text-orange-300" />;
    }
    // unsupported / unknown format — hex view only
    return <FileQuestion className="h-3.5 w-3.5 shrink-0 text-gray-400" />;
  };

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-white/10 bg-[#151515]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 text-[11px] uppercase tracking-wider text-gray-500">
        <span>Workspace</span>
      </div>

      {error ? (
        <div
          role="alert"
          className="m-2 rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-300"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="break-all">{error.message}</span>
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={clearError}
              className="shrink-0 text-red-400 hover:text-red-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : !root ? (
        <p className="p-3 text-xs text-gray-500">
          Open a workspace to browse the Res archives.
        </p>
      ) : (
        <div ref={parentRef} className="min-h-0 flex-1 overflow-auto py-1">
          <div
            className="relative w-full"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const row = rows[vi.index];
              const shift = {
                transform: `translateY(${vi.start}px)`,
              };
              if (row.type === "folder") {
                const isOpen = !!expandedDirs[row.path];
                return (
                  <div
                    key={vi.key}
                    data-index={vi.index}
                    ref={virtualizer.measureElement}
                    className="absolute left-0 w-full"
                    style={shift}
                  >
                    <button
                      type="button"
                      className="flex w-full items-center gap-1.5 py-1 pr-2 text-left text-xs hover:bg-white/5"
                      style={indent(row.depth)}
                      onClick={() => toggleDir(row.path)}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
                      )}
                      {isOpen ? (
                        <FolderOpen className="h-3.5 w-3.5 text-amber-300" />
                      ) : (
                        <Folder className="h-3.5 w-3.5 text-amber-300" />
                      )}
                      <span className="truncate">{row.name}</span>
                    </button>
                  </div>
                );
              }
              if (row.type === "archive") {
                const isOpen = !!expanded[row.archive];
                return (
                  <div
                    key={vi.key}
                    data-index={vi.index}
                    ref={virtualizer.measureElement}
                    className="absolute left-0 w-full"
                    style={shift}
                  >
                    <button
                      type="button"
                      className="flex w-full items-center gap-1.5 py-1 pr-2 text-left text-xs hover:bg-white/5"
                      style={indent(row.depth)}
                      onClick={() => void toggleArchive(row.archive)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setMenu({
                          x: e.clientX,
                          y: e.clientY,
                          archive: row.archive,
                        });
                      }}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
                      )}
                      <Archive className="h-3.5 w-3.5 text-indigo-300" />
                      <span className="truncate">{basename(row.archive)}</span>
                    </button>
                  </div>
                );
              }
              if (row.type === "loading") {
                return (
                  <div
                    key={vi.key}
                    data-index={vi.index}
                    ref={virtualizer.measureElement}
                    className="absolute left-0 w-full pr-2 text-xs italic text-gray-600"
                    style={{ ...shift, ...indent(row.depth + 1) }}
                  >
                    loading…
                  </div>
                );
              }
              return (
                <div
                  key={vi.key}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  className="absolute left-0 w-full"
                  style={shift}
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-1.5 py-1 pr-2 text-left text-xs hover:bg-white/5"
                    style={indent(row.depth + 1)}
                    onClick={() =>
                      void open(row.archive, row.entry.name, row.entry.kind)
                    }
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({
                        x: e.clientX,
                        y: e.clientY,
                        archive: row.archive,
                        entry: row.entry,
                      });
                    }}
                  >
                    {entryIcon(row.entry)}
                    <span className="truncate">{row.entry.name}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {menu && (
        <div
          role="menu"
          className="fixed z-50 w-40 rounded border border-white/10 bg-[#1e1e1e] py-1 shadow-xl"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-1 text-left text-xs text-gray-300 hover:bg-white/5"
            onClick={() => {
              const path = menu.entry
                ? `${menu.archive}/${menu.entry.name}`
                : menu.archive;
              void Clipboard.SetText(path).catch(() => undefined);
              setMenu(null);
            }}
          >
            <Copy className="h-3.5 w-3.5" /> Copy path
          </button>
          {menu.entry && menu.entry.kind === "tex" && (
            <>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-1 text-left text-xs text-gray-300 hover:bg-white/5"
                onClick={() => {
                  if (menu.entry) void handleExportPng(menu.archive, menu.entry.name);
                  setMenu(null);
                }}
              >
                <Download className="h-3.5 w-3.5" /> Export PNG…
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-1 text-left text-xs text-gray-300 hover:bg-white/5"
                onClick={() => {
                  if (menu.entry) void handleImportPng(menu.archive, menu.entry.name);
                  setMenu(null);
                }}
              >
                <Upload className="h-3.5 w-3.5" /> Import PNG…
              </button>
            </>
          )}
          {onExtract && (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-1 text-left text-xs text-gray-300 hover:bg-white/5"
              onClick={() => {
                onExtract(
                  menu.entry
                    ? {
                        archive: menu.archive,
                        entries: [menu.entry.name],
                        label: menu.entry.name,
                      }
                    : { archive: menu.archive, label: basename(menu.archive) },
                );
                setMenu(null);
              }}
            >
              <Download className="h-3.5 w-3.5" /> Extract…
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
