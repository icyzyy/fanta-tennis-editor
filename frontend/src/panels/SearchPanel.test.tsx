import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  openWorkspace: vi.fn(),
  listEntries: vi.fn(),
  readEntry: vi.fn(() => Promise.resolve({ kind: "xml", text: "<a/>" })),
  previewImage: vi.fn(() =>
    Promise.resolve({
      kind: "png",
      data: "AA==",
      texture: { width: 1, height: 1, format: "DXT1" },
    }),
  ),
  saveEntry: vi.fn(),
  setDirtyCount: vi.fn(() => Promise.resolve()),
  setBackup: vi.fn(() => Promise.resolve()),
  searchAll: vi.fn(),
  extract: vi.fn(),
}));
vi.mock("../api", async () => {
  const errors = await import("../api/errors");
  return { ...apiMock, ...errors };
});

import type { CancellableSearch, SearchHit } from "../api";
import { useBufferStore } from "../state/bufferStore";
import { useSearchStore } from "../state/searchStore";
import { kindOfEntry, SearchPanel } from "./SearchPanel";

const HIT: SearchHit = {
  archive: "/data/Res/Gui2.res",
  entry: "Gui_Login.set",
  line: 57767,
  text: 'Modulator="x"',
};

beforeEach(() => {
  vi.clearAllMocks();
  useBufferStore.setState({ buffers: [], activeId: null });
  useSearchStore.setState({
    query: "",
    hits: [],
    warnings: [],
    progress: null,
    running: false,
    summary: null,
    error: null,
    inflight: null,
  });
});

describe("kindOfEntry", () => {
  it("maps extensions to entry kinds", () => {
    expect(kindOfEntry("A.set")).toBe("set");
    expect(kindOfEntry("B.TEX")).toBe("tex");
    expect(kindOfEntry("C.dat")).toBe("other");
  });
});

describe("SearchPanel", () => {
  it("stays hidden without a query or results", () => {
    const { container } = render(<SearchPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a hit row; clicking opens the buffer scrolled to its line", async () => {
    useSearchStore.setState({
      query: "modulator",
      hits: [HIT],
      summary: { hits: 1, warnings: 0, cancelled: false },
    });
    render(<SearchPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Gui_Login.set:57767/ }));
    expect(apiMock.readEntry).toHaveBeenCalledWith(
      "/data/Res/Gui2.res",
      "Gui_Login.set",
    );
    await waitFor(() => {
      const st = useBufferStore.getState();
      expect(st.activeId).toBe("/data/Res/Gui2.res::Gui_Login.set");
      expect(st.buffers[0]?.scrollLine).toBe(57767);
    });
  });

  it("tex hits decode through previewImage", () => {
    useSearchStore.setState({
      query: "ui01",
      hits: [{ ...HIT, entry: "UI01.tex", line: undefined }],
      summary: { hits: 1, warnings: 0, cancelled: false },
    });
    render(<SearchPanel />);
    fireEvent.click(screen.getByRole("button", { name: /UI01.tex/ }));
    expect(apiMock.previewImage).toHaveBeenCalledWith(
      "/data/Res/Gui2.res",
      "UI01.tex",
    );
  });

  it("Cancel aborts the in-flight run", () => {
    const inflight = { cancel: vi.fn() } as unknown as CancellableSearch;
    useSearchStore.setState({ query: "x", running: true, inflight });
    render(<SearchPanel />);
    fireEvent.click(screen.getByRole("button", { name: /cancel search/i }));
    expect(inflight.cancel).toHaveBeenCalled();
    expect(useSearchStore.getState().running).toBe(false);
  });

  it("surfaces warnings below the hits", () => {
    useSearchStore.setState({
      query: "x",
      warnings: [
        { archive: "/data/Res/Bad.res", warning: "corrupt zip central directory" },
      ],
      summary: { hits: 0, warnings: 1, cancelled: false },
    });
    render(<SearchPanel />);
    expect(
      screen.getByText(/corrupt zip central directory/),
    ).toBeInTheDocument();
  });

  it("collapsing hides the rows, expanding brings them back", () => {
    useSearchStore.setState({
      query: "modulator",
      hits: [HIT],
      summary: { hits: 1, warnings: 0, cancelled: false },
    });
    render(<SearchPanel />);
    expect(
      screen.getByRole("button", { name: /Gui_Login.set/ }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /collapse search results/i }),
    );
    expect(
      screen.queryByRole("button", { name: /Gui_Login.set/ }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: /expand search results/i }),
    );
    expect(
      screen.getByRole("button", { name: /Gui_Login.set/ }),
    ).toBeInTheDocument();
  });

  it("shows the cancelled summary", () => {
    useSearchStore.setState({
      query: "x",
      summary: { hits: 2, warnings: 0, cancelled: true },
    });
    render(<SearchPanel />);
    expect(
      screen.getByText("2 hits · 0 warnings · cancelled"),
    ).toBeInTheDocument();
  });

  it("reports run errors in the header", () => {
    useSearchStore.setState({ query: "x", error: "root not open" });
    render(<SearchPanel />);
    expect(screen.getByText("root not open")).toBeInTheDocument();
  });
});
