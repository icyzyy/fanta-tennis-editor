import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  applyExeSetting: vi.fn(),
}));
vi.mock("../api", async () => {
  const errors = await import("../api/errors");
  return { ...apiMock, ...errors };
});
const runtimeMock = vi.hoisted(() => ({}));
vi.mock("@wailsio/runtime", () => runtimeMock);

import type { ExeSetting, ExeState } from "../api";
import { useAppStore } from "../state/appStore";
import { useExeStore } from "../state/exeStore";
import { useToastStore } from "../state/toastStore";
import { ExePanel } from "./ExePanel";

const SETTINGS: ExeSetting[] = [
  {
    id: "refillUrl",
    label: "Refill URL",
    value: "http://old.example",
    editable: true,
    reason: "",
    maxLength: 127,
    name: "",
    nameEditable: false,
    nameReason: "",
  },
  {
    id: "customDll",
    label: "Custom DLL load",
    value: "enabled",
    editable: true,
    reason: "",
    maxLength: 0,
    name: "jftse.dll",
    nameEditable: true,
    nameReason: "",
  },
  {
    id: "serverLock",
    label: "Server lock",
    value: "retail",
    editable: false,
    reason: "retail builds only",
    maxLength: 0,
    name: "",
    nameEditable: false,
    nameReason: "retail builds only",
  },
];

const STATE: ExeState = {
  path: "C:/GrandChase/fanta.exe",
  settings: SETTINGS,
  md5: "abc123",
};

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ mode: "exe" });
  useToastStore.setState({ toasts: [] });
  useExeStore.setState({
    path: STATE.path,
    settings: STATE.settings,
    md5: STATE.md5,
    loading: false,
    applying: false,
    error: null,
  });
});

describe("ExePanel", () => {
  it("renders the path and md5 from the store", () => {
    render(<ExePanel />);
    expect(screen.getByText("C:/GrandChase/fanta.exe")).toBeInTheDocument();
    expect(screen.getByText("md5: abc123")).toBeInTheDocument();
  });

  it("renders every setting label and value", () => {
    render(<ExePanel />);
    expect(screen.getByLabelText("Refill URL")).toHaveValue("http://old.example");
    expect(screen.getByRole("checkbox", { name: "Enabled" })).toBeChecked();
    expect(screen.getByLabelText("Custom DLL load")).toHaveValue("jftse.dll");
    expect(screen.getByText("Server lock")).toBeInTheDocument();
  });

  it("disabled settings show the reason and offer no Apply", () => {
    const { container } = render(<ExePanel />);
    expect(screen.getByText("retail builds only")).toBeInTheDocument();
    // Refill URL input + customDll checkbox + customDll name input = 3
    expect(container.querySelectorAll("input, select")).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /^Apply/ })).toHaveLength(2);
  });

  it("text setting applies the typed value", async () => {
    apiMock.applyExeSetting.mockResolvedValue(STATE);
    render(<ExePanel />);
    fireEvent.change(screen.getByLabelText("Refill URL"), {
      target: { value: "http://new.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply Refill URL" }));
    await waitFor(() =>
      expect(apiMock.applyExeSetting).toHaveBeenCalledWith("refillUrl", "http://new.example", ""),
    );
  });

  it("toggling the checkbox stages enabled/disabled", async () => {
    apiMock.applyExeSetting.mockResolvedValue(STATE);
    render(<ExePanel />);
    const box = screen.getByRole("checkbox", { name: "Enabled" });
    fireEvent.click(box);
    expect(box).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Apply Custom DLL load" }));
    await waitFor(() =>
      expect(apiMock.applyExeSetting).toHaveBeenCalledWith("customDll", "disabled", "jftse.dll"),
    );
  });

  it("name is editable while the toggle is disabled (independent)", async () => {
    apiMock.applyExeSetting.mockResolvedValue(STATE);
    useExeStore.setState({
      settings: SETTINGS.map((s) =>
        s.id === "customDll" ? { ...s, value: "disabled" } : s,
      ),
    });
    render(<ExePanel />);
    const name = screen.getByLabelText("Custom DLL load");
    expect(name).toBeEnabled();
    fireEvent.change(name, { target: { value: "other" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply Custom DLL load" }));
    await waitFor(() =>
      expect(apiMock.applyExeSetting).toHaveBeenCalledWith("customDll", "disabled", "other.dll"),
    );
  });

  it("appends .dll on blur (case-sensitive, no stripping)", () => {
    render(<ExePanel />);
    const name = screen.getByLabelText("Custom DLL load");
    fireEvent.change(name, { target: { value: "foo" } });
    fireEvent.blur(name);
    expect(name).toHaveValue("foo.dll");
    fireEvent.change(name, { target: { value: "bar.DLL" } });
    fireEvent.blur(name);
    expect(name).toHaveValue("bar.DLL.dll");
  });

  it("name input is disabled with a reason when nameEditable is false", () => {
    useExeStore.setState({
      settings: SETTINGS.map((s) =>
        s.id === "customDll"
          ? { ...s, nameEditable: false, nameReason: "unrecognized dll name in code cave" }
          : s,
      ),
    });
    render(<ExePanel />);
    expect(screen.getByLabelText("Custom DLL load")).toBeDisabled();
    expect(screen.getByText("unrecognized dll name in code cave")).toBeInTheDocument();
  });

  it("empty name sends an empty string (toggle only)", async () => {
    apiMock.applyExeSetting.mockResolvedValue(STATE);
    render(<ExePanel />);
    const name = screen.getByLabelText("Custom DLL load");
    fireEvent.change(name, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply Custom DLL load" }));
    await waitFor(() =>
      expect(apiMock.applyExeSetting).toHaveBeenCalledWith("customDll", "enabled", ""),
    );
  });

  it("over-limit name after .dll append surfaces a backend error and keeps the panel", async () => {
    apiMock.applyExeSetting.mockRejectedValue(new Error("dll name too long"));
    render(<ExePanel />);
    const name = screen.getByLabelText("Custom DLL load");
    fireEvent.change(name, { target: { value: "abcdefgh" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply Custom DLL load" }));
    await waitFor(() =>
      expect(useToastStore.getState().toasts).toContainEqual(
        expect.objectContaining({ kind: "error", message: "dll name too long" }),
      ),
    );
    expect(screen.getByText("C:/GrandChase/fanta.exe")).toBeInTheDocument();
  });

  it("apply success toasts and shows the fresh md5", async () => {
    apiMock.applyExeSetting.mockResolvedValue({ ...STATE, md5: "def456" });
    render(<ExePanel />);
    fireEvent.click(screen.getByRole("button", { name: "Apply Custom DLL load" }));
    await waitFor(() =>
      expect(useToastStore.getState().toasts).toContainEqual(
        expect.objectContaining({
          kind: "success",
          message: "Applied Custom DLL load — md5 def456",
        }),
      ),
    );
    expect(await screen.findByText("md5: def456")).toBeInTheDocument();
  });

  it("apply failure toasts an error and keeps the panel", async () => {
    apiMock.applyExeSetting.mockRejectedValue(new Error("patch rejected"));
    render(<ExePanel />);
    fireEvent.click(screen.getByRole("button", { name: "Apply Custom DLL load" }));
    await waitFor(() =>
      expect(useToastStore.getState().toasts).toContainEqual(
        expect.objectContaining({ kind: "error", message: "patch rejected" }),
      ),
    );
    expect(useAppStore.getState().mode).toBe("exe");
    expect(screen.getByText("C:/GrandChase/fanta.exe")).toBeInTheDocument();
  });

  it("back returns to the picker and resets the exe store", () => {
    render(<ExePanel />);
    fireEvent.click(screen.getByRole("button", { name: /back to picker/i }));
    expect(useAppStore.getState().mode).toBe("picker");
    expect(useExeStore.getState().path).toBe("");
  });

  it("while applying, Back and every Apply button are disabled", () => {
    useExeStore.setState({ applying: true });
    render(<ExePanel />);
    expect(screen.getByRole("button", { name: /back to picker/i })).toBeDisabled();
    const applyButtons = screen.getAllByRole("button", { name: /^Apply/ });
    expect(applyButtons).toHaveLength(2);
    for (const button of applyButtons) {
      expect(button).toBeDisabled();
    }
  });
});
