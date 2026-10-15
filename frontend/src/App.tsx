import { useEffect, useState } from "react";
import { BufferTabs } from "./panels/BufferTabs";
import { BufferView } from "./panels/BufferView";
import { ExePanel } from "./panels/ExePanel";
import { ExtractDialog, type ExtractTarget } from "./panels/ExtractDialog";
import { Picker } from "./panels/Picker";
import { SearchPanel } from "./panels/SearchPanel";
import { SettingsDialog } from "./panels/SettingsDialog";
import { StatusBar } from "./panels/StatusBar";
import { ToastStack } from "./panels/ToastStack";
import { Toolbar } from "./panels/Toolbar";
import { WorkspaceTree } from "./panels/WorkspaceTree";
import { useAppStore } from "./state/appStore";
import { useAppWiring } from "./state/wiring";
import { fitWindow } from "./state/windowFit";

export default function App() {
  useAppWiring();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [extractTarget, setExtractTarget] = useState<ExtractTarget | null>(
    null,
  );
  const mode = useAppStore((s) => s.mode);

  // Window-fits-content: resize on every mode switch, including launch.
  useEffect(() => {
    void fitWindow(mode);
  }, [mode]);

  // Every hook above runs unconditionally; the mode gates come after.
  if (mode === "picker") {
    return (
      <>
        <Picker />
        <ToastStack />
      </>
    );
  }
  if (mode === "exe") {
    return (
      <>
        <ExePanel />
        <ToastStack />
      </>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[#0a0a0a] text-gray-200">
      <Toolbar onOpenSettings={() => setSettingsOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <WorkspaceTree onExtract={setExtractTarget} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <BufferTabs />
          <BufferView />
        </div>
      </div>
      <SearchPanel />
      <StatusBar />
      <ToastStack />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ExtractDialog
        target={extractTarget}
        onClose={() => setExtractTarget(null)}
      />
    </div>
  );
}
