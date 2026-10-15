import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  openWorkspace: vi.fn(),
  openExe: vi.fn(),
  setDirtyCount: vi.fn(),
}));
vi.mock("../api", async () => {
  const errors = await import("../api/errors");
  return { ...apiMock, ...errors };
});
const runtimeMock = vi.hoisted(() => ({
  OpenFile: vi.fn(() => Promise.resolve("")),
  Question: vi.fn(() => Promise.resolve("Cancel")),
}));
vi.mock("@wailsio/runtime", () => ({
  Dialogs: { OpenFile: runtimeMock.OpenFile, Question: runtimeMock.Question },
  Clipboard: { SetText: vi.fn(() => Promise.resolve()) },
}));

import { useAppStore } from "../state/appStore";
import { useExeStore } from "../state/exeStore";
import { useToastStore } from "../state/toastStore";
import { Picker } from "./Picker";

beforeEach(() => {
  vi.clearAllMocks(); // clears calls, keeps vi.fn implementations
  useAppStore.setState({ mode: "picker" });
  useExeStore.getState().reset();
  useToastStore.setState({ toasts: [] });
});

describe("Picker", () => {
  it("renders the title and both actions", () => {
    render(<Picker />);
    expect(
      screen.getByRole("heading", { name: "FantaTennis Editor" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /select resource folder/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /select exe/i })).toBeInTheDocument();
  });

  it("select resource folder runs the folder flow and enters workspace mode", async () => {
    runtimeMock.OpenFile.mockResolvedValue("/data/Res");
    apiMock.openWorkspace.mockResolvedValue({ root: "/data/Res", archives: [] });
    render(<Picker />);
    fireEvent.click(screen.getByRole("button", { name: /select resource folder/i }));
    await waitFor(() =>
      expect(apiMock.openWorkspace).toHaveBeenCalledWith("/data/Res"),
    );
    expect(useAppStore.getState().mode).toBe("workspace");
    expect(runtimeMock.OpenFile).toHaveBeenCalledWith(
      expect.objectContaining({ CanChooseDirectories: true }),
    );
  });

  it("dismissing the folder dialog keeps the picker", async () => {
    runtimeMock.OpenFile.mockResolvedValue("");
    render(<Picker />);
    fireEvent.click(screen.getByRole("button", { name: /select resource folder/i }));
    await waitFor(() => expect(runtimeMock.OpenFile).toHaveBeenCalledTimes(1));
    expect(apiMock.openWorkspace).not.toHaveBeenCalled();
    expect(useAppStore.getState().mode).toBe("picker");
  });

  it("select exe opens the exe and enters exe mode", async () => {
    runtimeMock.OpenFile.mockResolvedValue("/g/FantaTennis.exe");
    apiMock.openExe.mockResolvedValue({
      path: "/g/FantaTennis.exe",
      settings: [],
      md5: "",
    });
    render(<Picker />);
    fireEvent.click(screen.getByRole("button", { name: /select exe/i }));
    await waitFor(() => expect(useAppStore.getState().mode).toBe("exe"));
    expect(runtimeMock.OpenFile).toHaveBeenCalledWith({
      CanChooseFiles: true,
      CanChooseDirectories: false,
      Title: "Select FantaTennis.exe",
      Filters: [{ DisplayName: "Executable (*.exe)", Pattern: "*.exe" }],
    });
    expect(apiMock.openExe).toHaveBeenCalledWith("/g/FantaTennis.exe");
    expect(useExeStore.getState().path).toBe("/g/FantaTennis.exe");
  });

  it("an exe open failure toasts and stays on picker", async () => {
    runtimeMock.OpenFile.mockResolvedValue("/g/FantaTennis.exe");
    apiMock.openExe.mockRejectedValue(new Error("boom"));
    render(<Picker />);
    fireEvent.click(screen.getByRole("button", { name: /select exe/i }));
    await waitFor(() => {
      const toasts = useToastStore.getState().toasts;
      expect(
        toasts.some(
          (t) => t.kind === "error" && t.message === "Could not open exe: boom",
        ),
      ).toBe(true);
    });
    expect(useAppStore.getState().mode).toBe("picker");
  });

  it("dismissing the exe dialog does nothing", async () => {
    runtimeMock.OpenFile.mockResolvedValue("");
    render(<Picker />);
    fireEvent.click(screen.getByRole("button", { name: /select exe/i }));
    await waitFor(() => expect(runtimeMock.OpenFile).toHaveBeenCalledTimes(1));
    expect(apiMock.openExe).not.toHaveBeenCalled();
    expect(useAppStore.getState().mode).toBe("picker");
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
