import { Dialogs } from "@wailsio/runtime";
import { toAppError } from "../api";
import { useAppStore } from "../state/appStore";
import { useExeStore } from "../state/exeStore";
import { useToastStore } from "../state/toastStore";
import { selectResourceFolder } from "../state/workspaceFlows";

// Both entries are peer actions, so they share one primary style.
const primaryBtn =
  "rounded bg-indigo-600 px-6 py-3 text-base font-medium text-white hover:bg-indigo-500";

// Launch screen (spec §229-230): pick a Res folder or an exe; nothing
// auto-opens.
export function Picker() {
  const handleExe = async () => {
    try {
      const picked = await Dialogs.OpenFile({
        CanChooseFiles: true,
        CanChooseDirectories: false,
        Title: "Select FantaTennis.exe",
        Filters: [{ DisplayName: "Executable (*.exe)", Pattern: "*.exe" }],
      });
      const path = Array.isArray(picked) ? picked[0] : picked;
      if (!path) return;
      await useExeStore.getState().openExe(path);
      useAppStore.getState().setMode("exe");
    } catch (e) {
      useToastStore
        .getState()
        .push("error", `Could not open exe: ${toAppError(e).message}`);
    }
  };

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-[#0a0a0a] text-gray-200">
      {/* #picker-fit: measured by windowFit to size the window to content. */}
      <div id="picker-fit" className="flex flex-col items-center gap-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          FantaTennis Editor
        </h1>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void selectResourceFolder()}
            className={primaryBtn}
          >
            Select resource folder
          </button>
          <button
            type="button"
            onClick={() => void handleExe()}
            className={primaryBtn}
          >
            Select exe
          </button>
        </div>
      </div>
    </div>
  );
}
