import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  extract: vi.fn(() =>
    Promise.resolve({ files: ["a.xml", "b.xml", "c.xml"] }),
  ),
  openWorkspace: vi.fn(),
  listEntries: vi.fn(),
  readEntry: vi.fn(),
  previewImage: vi.fn(),
  saveEntry: vi.fn(),
  setDirtyCount: vi.fn(() => Promise.resolve()),
  setBackup: vi.fn(() => Promise.resolve()),
  searchAll: vi.fn(),
}));
vi.mock("../api", async () => {
  const errors = await import("../api/errors");
  return { ...apiMock, ...errors };
});
const runtimeMock = vi.hoisted(() => ({
  Dialogs: { OpenFile: vi.fn(() => Promise.resolve("")) },
}));
vi.mock("@wailsio/runtime", () => runtimeMock);

import { useSettingsStore } from "../state/settingsStore";
import { useToastStore } from "../state/toastStore";
import { useWorkspaceStore } from "../state/workspaceStore";
import { ExtractDialog, type ExtractTarget } from "./ExtractDialog";

const TARGET: ExtractTarget = {
  archive: "/data/Res/Gui2.res",
  entries: ["Gui_Login.set"],
  label: "Gui_Login.set",
};

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.extract.mockResolvedValue({ files: ["a.xml", "b.xml", "c.xml"] });
  runtimeMock.Dialogs.OpenFile.mockResolvedValue("");
  useSettingsStore.setState({
    backupBeforeWrite: true,
    defaultExtractDest: "",
    searchScope: "all",
  });
  useWorkspaceStore.setState({ extractProgress: null });
  useToastStore.setState({ toasts: [] });
});

describe("ExtractDialog", () => {
  it("renders nothing without a target", () => {
    const { container } = render(
      <ExtractDialog target={null} onClose={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("pre-fills the default destination from settings", () => {
    useSettingsStore.setState({ defaultExtractDest: "/tmp/out" });
    render(<ExtractDialog target={TARGET} onClose={() => {}} />);
    expect(screen.getByPlaceholderText("/path/to/folder")).toHaveValue(
      "/tmp/out",
    );
  });

  it("Extract stays disabled until a destination exists", () => {
    render(<ExtractDialog target={TARGET} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: /^extract$/i })).toBeDisabled();
  });

  it("browse picks a folder", async () => {
    runtimeMock.Dialogs.OpenFile.mockResolvedValue("/picked/dir");
    render(<ExtractDialog target={TARGET} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /browse/i }));
    await waitFor(() =>
      expect(screen.getByPlaceholderText("/path/to/folder")).toHaveValue(
        "/picked/dir",
      ),
    );
  });

  it("extracts and reports success as a toast", async () => {
    const onClose = vi.fn();
    render(<ExtractDialog target={TARGET} onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText("/path/to/folder"), {
      target: { value: "/tmp/out" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^extract$/i }));
    await waitFor(() =>
      expect(apiMock.extract).toHaveBeenCalledWith({
        archive: "/data/Res/Gui2.res",
        entries: ["Gui_Login.set"],
        dest: "/tmp/out",
        decrypted: true,
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(useToastStore.getState().toasts[0]?.message).toContain(
      "Extracted 3 files",
    );
  });

  it("failure surfaces an error toast and keeps the dialog open", async () => {
    apiMock.extract.mockRejectedValue(new Error("disk full"));
    const onClose = vi.fn();
    render(<ExtractDialog target={TARGET} onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText("/path/to/folder"), {
      target: { value: "/tmp/out" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^extract$/i }));
    await waitFor(() =>
      expect(useToastStore.getState().toasts[0]?.message).toContain(
        "Extract failed: disk full",
      ),
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
