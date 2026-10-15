import { useMemo } from "react";

const BYTES_PER_ROW = 16;
const MAX_BYTES = 65536;

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function formatRow(bytes: Uint8Array, offset: number): string {
  const chunk = bytes.subarray(offset, offset + BYTES_PER_ROW);
  const hex = Array.from(chunk, (b) => b.toString(16).padStart(2, "0"))
    .join(" ")
    .padEnd(BYTES_PER_ROW * 3 - 1, " ");
  const ascii = Array.from(chunk, (b) =>
    b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : ".",
  ).join("");
  return `${offset.toString(16).padStart(8, "0")}  ${hex}  ${ascii}`;
}

interface HexViewProps {
  data: string; // base64 payload (presenter caps previews at 1 MiB)
  totalBytes?: number; // original size when the presenter truncated
}

export function HexView({ data, totalBytes }: HexViewProps) {
  const { rows, total } = useMemo(() => {
    const all = decodeBase64(data);
    const view = all.length > MAX_BYTES ? all.subarray(0, MAX_BYTES) : all;
    const rows: string[] = [];
    for (let off = 0; off < view.length; off += BYTES_PER_ROW) {
      rows.push(formatRow(view, off));
    }
    // Prefer the true original size when the presenter truncated the payload.
    return { rows, total: totalBytes ?? all.length };
  }, [data, totalBytes]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-white/10 bg-[#151515] px-3 py-1 text-xs text-gray-400">
        <span>{total} bytes</span>
        <span className="text-gray-600">hex · 16 bytes per row</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2 font-mono text-xs leading-5 text-gray-300">
        {rows.map((r, i) => (
          <div key={i} data-row={i} className="whitespace-pre hover:bg-white/5">
            {r}
          </div>
        ))}
        {rows.length === 0 && (
          <span className="text-gray-500">empty payload</span>
        )}
      </div>
      {total > MAX_BYTES && (
        <div className="border-t border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-300">
          showing first {MAX_BYTES} of {total} bytes — use Extract for a full
          copy
        </div>
      )}
    </div>
  );
}
