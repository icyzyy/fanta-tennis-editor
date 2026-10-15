import { Loader2 } from "lucide-react";
import type { ReactElement } from "react";
import { useBufferStore } from "../state/bufferStore";
import { BmpView } from "./BmpView";
import { HexView } from "./HexView";
import { TexturePreview } from "./TexturePreview";
import { XmlEditor } from "./XmlEditor";

export function BufferView() {
  const buffers = useBufferStore((s) => s.buffers);
  const activeId = useBufferStore((s) => s.activeId);
  const updateText = useBufferStore((s) => s.updateText);
  const save = useBufferStore((s) => s.save);
  const clearScrollLine = useBufferStore((s) => s.clearScrollLine);

  const buffer = buffers.find((b) => b.id === activeId) ?? null;
  if (!buffer) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-gray-600">
        Select an entry in the workspace tree.
      </div>
    );
  }

  let body: ReactElement;
  if (buffer.loading) {
    body = (
      <div
        role="status"
        className="flex flex-1 items-center justify-center gap-2 text-sm text-gray-400"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading {buffer.entry}…
      </div>
    );
  } else if (buffer.error) {
    body = (
      <div
        role="alert"
        className="m-6 max-w-xl rounded border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300"
      >
        <div className="font-semibold">{buffer.error.code}</div>
        <div className="mt-1">{buffer.error.message}</div>
      </div>
    );
  } else if (!buffer.content) {
    body = <p className="p-4 text-sm text-gray-500">no content</p>;
  } else if (buffer.content.kind === "png") {
    body = (
      <TexturePreview
        content={buffer.content}
        archive={buffer.archive}
        entry={buffer.entry}
      />
    );
  } else if (buffer.content.kind === "binary") {
    // .bmp is handed straight to the webview's native decoder (no app-side
    // format logic); everything else stays a hex dump.
    body = buffer.entry.toLowerCase().endsWith(".bmp") ? (
      <BmpView data={buffer.content.data} />
    ) : (
      <HexView
        data={buffer.content.data ?? ""}
        totalBytes={buffer.content.totalBytes}
      />
    );
  } else if (buffer.content.kind === "text") {
    body = (
      <>
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-5 text-gray-300">
          {buffer.content.text ?? ""}
        </pre>
        {buffer.content.truncated && (
          <div className="border-t border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-300">
            truncated preview — first 1 MiB of {buffer.content.totalBytes}{" "}
            bytes; use Extract for a full copy
          </div>
        )}
      </>
    );
  } else {
    // xml: editable for .set, read-only XmlViewer mode otherwise (spec §4)
    body = (
      <XmlEditor
        text={buffer.text}
        saveError={buffer.saveError}
        scrollLine={buffer.scrollLine}
        readOnly={buffer.kind !== "set"}
        onChange={(t) => updateText(buffer.id, t)}
        onSave={() => void save(buffer.id)}
        onScrollLineConsumed={() => clearScrollLine(buffer.id)}
      />
    );
  }

  return <div className="flex min-h-0 flex-1 flex-col">{body}</div>;
}
