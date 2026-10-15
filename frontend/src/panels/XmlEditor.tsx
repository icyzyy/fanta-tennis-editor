import { xml } from "@codemirror/lang-xml";
import { Compartment, EditorState, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
} from "@codemirror/view";
import { basicSetup } from "codemirror";
import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AppError } from "../api";

export interface XmlEditorProps {
  text: string;
  saveError: AppError | null;
  scrollLine: number | null;
  onChange: (text: string) => void;
  onSave: () => void;
  onScrollLineConsumed: () => void;
  /** XmlViewer mode (spec §4): read-only display of non-.set XML buffers. */
  readOnly?: boolean;
  /** Test/future hook: receives the live CodeMirror view. */
  onViewReady?: (view: EditorView) => void;
}

const setLineHighlight = StateEffect.define<DecorationSet>();

/** Active error/flash line decoration (exported for tests). */
export const lineHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setLineHighlight)) return e.value;
    }
    return value.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

/**
 * Cosmetic pretty-printer for the read-only preview mode: 2-space indent per
 * depth, text nodes collapsed onto one line. Output is display-only — saves
 * always use the raw buffer text.
 */
export function formatXml(source: string): string {
  const tokens = source.match(/<[^>]+>|[^<]+/g) ?? [];
  const out: string[] = [];
  let depth = 0;
  const indent = () => "  ".repeat(Math.max(depth, 0));
  for (const raw of tokens) {
    const tok = raw.trim();
    if (!tok) continue;
    if (tok.startsWith("<?") || tok.startsWith("<!")) {
      out.push(indent() + tok);
    } else if (tok.startsWith("</")) {
      depth = Math.max(depth - 1, 0);
      out.push(indent() + tok);
    } else if (tok.startsWith("<")) {
      out.push(indent() + tok);
      if (!tok.endsWith("/>")) depth++;
    } else {
      out.push(indent() + tok.replace(/\s+/g, " "));
    }
  }
  return out.join("\n");
}

/** Detail first (Go presenter extraction), then a `line N` message fallback. */
export function parseErrorLine(err: AppError | null): number | null {
  if (!err) return null;
  const fromDetail = err.detail ? Number.parseInt(err.detail, 10) : NaN;
  if (Number.isInteger(fromDetail) && fromDetail > 0) return fromDetail;
  const m = /line (\d+)/.exec(err.message);
  return m ? Number.parseInt(m[1], 10) : null;
}

function replaceDoc(view: EditorView, doc: string): void {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc } });
}

function highlightLine(view: EditorView, lineNo: number, cls: string): void {
  const n = Math.min(Math.max(lineNo, 1), view.state.doc.lines);
  const line = view.state.doc.line(n);
  view.dispatch({
    effects: [
      setLineHighlight.of(Decoration.set([Decoration.line({ class: cls }).range(line.from)])),
      EditorView.scrollIntoView(line.from, { y: "center" }),
    ],
  });
}

export function XmlEditor(props: XmlEditorProps) {
  const { text, saveError, scrollLine, readOnly = false } = props;
  const [pretty, setPretty] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const suppressRef = useRef(false);
  const propsRef = useRef(props);
  propsRef.current = props;
  const readOnlyCompartment = useRef(new Compartment()).current;
  const errorLine = parseErrorLine(saveError);

  // Mount the editor once; all callbacks go through propsRef so the view
  // never captures stale handlers.
  useEffect(() => {
    const view = new EditorView({
      parent: containerRef.current!,
      state: EditorState.create({
        doc: propsRef.current.text,
        extensions: [
          basicSetup,
          xml(),
          EditorView.lineWrapping,
          lineHighlightField,
          readOnlyCompartment.of([
            EditorState.readOnly.of(propsRef.current.readOnly === true),
            EditorView.editable.of(propsRef.current.readOnly !== true),
          ]),
          EditorView.baseTheme({
            ".cm-error-line": { background: "rgba(239,68,68,0.18)" },
            ".cm-flash-line": { background: "rgba(99,102,241,0.22)" },
          }),
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                propsRef.current.onSave();
                return true;
              },
            },
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !suppressRef.current) {
              propsRef.current.onChange(u.state.doc.toString());
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    propsRef.current.onViewReady?.(view);
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External text changes (buffer switch restore, store reset) — guarded so
  // onChange never echoes programmatic updates back into the store.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === text) return;
    suppressRef.current = true;
    try {
      replaceDoc(view, text);
    } finally {
      suppressRef.current = false;
    }
  }, [text]);

  // Effective read-only = pretty preview OR an explicitly read-only buffer
  // (spec §4 XmlViewer); the compartment is reconfigured whenever either
  // input changes, so togglePretty only swaps the document text.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const ro = pretty || readOnly;
    view.dispatch({
      effects: readOnlyCompartment.reconfigure([
        EditorState.readOnly.of(ro),
        EditorView.editable.of(!ro),
      ]),
    });
  }, [pretty, readOnly]);

  // invalid_xml (or any coded save failure with a line) → highlight + scroll.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const lineNo = parseErrorLine(saveError);
    if (lineNo == null) {
      view.dispatch({ effects: setLineHighlight.of(Decoration.none) });
      return;
    }
    highlightLine(view, lineNo, "cm-error-line");
  }, [saveError]);

  // Search-hit line → flash + scroll, then tell the store to clear it.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || scrollLine == null) return;
    highlightLine(view, scrollLine, "cm-flash-line");
    propsRef.current.onScrollLineConsumed();
  }, [scrollLine]);

  const togglePretty = () => {
    const view = viewRef.current;
    if (!view) return;
    const next = !pretty;
    setPretty(next);
    suppressRef.current = true;
    try {
      replaceDoc(view, next ? formatXml(view.state.doc.toString()) : propsRef.current.text);
    } finally {
      suppressRef.current = false;
    }
  };

  const jumpToError = () => {
    const view = viewRef.current;
    if (view && errorLine != null) highlightLine(view, errorLine, "cm-error-line");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-white/10 bg-[#151515] px-3 py-1 text-xs text-gray-400">
        <span className="truncate">
          {pretty
            ? "pretty preview — read-only, saves always use the raw text"
            : "raw"}
        </span>
        <button
          type="button"
          onClick={togglePretty}
          aria-pressed={pretty}
          className={`rounded border px-2 py-0.5 ${
            pretty
              ? "border-indigo-500/60 text-indigo-300"
              : "border-white/10 text-gray-400 hover:bg-white/5"
          }`}
        >
          Pretty
        </button>
      </div>

      {saveError && (
        <div
          role="alert"
          className="flex items-center gap-2 border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {saveError.code}: {saveError.message}
          </span>
          {errorLine != null && (
            <button
              type="button"
              onClick={jumpToError}
              className="ml-auto shrink-0 underline hover:text-red-200"
            >
              Go to line {errorLine}
            </button>
          )}
        </div>
      )}

      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto" />
    </div>
  );
}
