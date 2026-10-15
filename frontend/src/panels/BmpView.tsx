import { useState } from "react";

interface BmpViewProps {
  /** base64 of the raw BMP file, untouched — never parsed by the app. */
  data?: string;
}

/**
 * Shows a .bmp entry by handing the raw bytes to the webview's built-in
 * BMP codec through a data: URL. The app contains no format logic here;
 * Extract keeps providing a byte-exact copy.
 */
export function BmpView({ data }: BmpViewProps) {
  const [failed, setFailed] = useState(false);

  if (!data) return <p className="p-4 text-sm text-gray-500">no payload</p>;
  if (failed) {
    return (
      <p className="p-4 text-sm text-gray-500">
        the webview could not render this BMP — use Extract for a raw copy
      </p>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[#0a0a0a] p-4">
      <img
        src={`data:image/bmp;base64,${data}`}
        alt="bmp preview"
        className="max-h-full max-w-full object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
