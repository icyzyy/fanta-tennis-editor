import { Dialogs } from "@wailsio/runtime";
import { Download, Image as ImageIcon } from "lucide-react";
import { useState, type CSSProperties } from "react";
import * as api from "../api";
import type { Content } from "../api";
import { useToastStore } from "../state/toastStore";

interface TexturePreviewProps {
  content: Content;
  /** Buffer identity — enables the Export PNG button when both are set. */
  archive?: string;
  entry?: string;
}

const PNG_FILTERS = [{ DisplayName: "PNG images (*.png)", Pattern: "*.png" }];

/** Alpha checkerboard — layered gradients can't be Tailwind utilities. */
const CHECKERBOARD: CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, #262938 25%, transparent 25%), linear-gradient(-45deg, #262938 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #262938 75%), linear-gradient(-45deg, transparent 75%, #262938 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
  backgroundColor: "#171926",
};

export function TexturePreview({ content, archive, entry }: TexturePreviewProps) {
  const [actualSize, setActualSize] = useState(false);
  const tex = content.texture;
  const src = content.data ? `data:image/png;base64,${content.data}` : "";

  const exportPng = async () => {
    if (!archive || !entry) return;
    try {
      const dest = await Dialogs.SaveFile({ Title: "Export PNG", Filters: PNG_FILTERS });
      const path = Array.isArray(dest) ? dest[0] : dest;
      if (!path) return; // dismissed
      await api.exportTexturePng({ archive, entry, dest: path });
      useToastStore.getState().push("success", `Exported ${path}`);
    } catch (e) {
      useToastStore.getState().push("error", api.toAppError(e).message);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-white/10 bg-[#151515] px-3 py-1 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5 text-gray-400" />
          {tex ? `${tex.width}×${tex.height} · ${tex.format}` : "texture"}
        </span>
        <span className="flex items-center gap-1.5">
          {archive && entry && (
            <button
              type="button"
              onClick={() => void exportPng()}
              className="flex items-center gap-1 rounded border border-white/10 px-2 py-0.5 text-gray-300 hover:bg-white/5"
            >
              <Download className="h-3 w-3" /> Export PNG
            </button>
          )}
          <button
            type="button"
            onClick={() => setActualSize(!actualSize)}
            className="rounded border border-white/10 px-2 py-0.5 text-gray-300 hover:bg-white/5"
          >
            {actualSize ? "Fit" : "100%"}
          </button>
        </span>
      </div>
      <div
        className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4"
        style={CHECKERBOARD}
      >
        {src ? (
          <img
            src={src}
            alt="texture preview"
            style={{ imageRendering: "pixelated" }}
            className={
              actualSize ? "" : "max-h-full max-w-full object-contain"
            }
          />
        ) : (
          <span className="text-xs text-gray-500">no texture payload</span>
        )}
      </div>
    </div>
  );
}
