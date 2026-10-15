import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EditorView } from "@codemirror/view";
import type { AppError } from "../api";
import {
  formatXml,
  lineHighlightField,
  parseErrorLine,
  XmlEditor,
  type XmlEditorProps,
} from "./XmlEditor";

function props(
  over: Partial<Pick<XmlEditorProps, "text" | "saveError" | "scrollLine" | "readOnly">> = {},
) {
  return {
    text: "<root/>",
    saveError: null,
    scrollLine: null,
    onChange: vi.fn(),
    onSave: vi.fn(),
    onScrollLineConsumed: vi.fn(),
    ...over,
  };
}

// The returned object must expose the view LIVE: a plain `{ view, ready }`
// snapshot would freeze `view` as undefined forever (verified failing).
function captureView(): { view: EditorView; ready: (v: EditorView) => void } {
  const box: { v: EditorView | null } = { v: null };
  return {
    get view() {
      return box.v as EditorView;
    },
    ready: (v) => {
      box.v = v;
    },
  };
}

describe("formatXml", () => {
  it("indents nested elements and puts text on its own line", () => {
    expect(formatXml("<a><b>1</b><b>2</b></a>")).toBe(
      "<a>\n  <b>\n    1\n  </b>\n  <b>\n    2\n  </b>\n</a>",
    );
  });

  it("keeps declarations and self-closing tags at their depth", () => {
    expect(formatXml('<?xml version="1.0"?><a><b/></a>')).toBe(
      '<?xml version="1.0"?>\n<a>\n  <b/>\n</a>',
    );
  });

  it("collapses whitespace inside text nodes", () => {
    expect(formatXml("<a>  hello \n  world  </a>")).toBe("<a>\n  hello world\n</a>");
  });
});

describe("parseErrorLine", () => {
  it("prefers detail", () => {
    expect(parseErrorLine({ code: "invalid_xml", message: "line 9", detail: "42" })).toBe(42);
  });

  it("falls back to the message", () => {
    expect(parseErrorLine({ code: "invalid_xml", message: "save: line 17: x" })).toBe(17);
  });

  it("returns null without a line", () => {
    expect(parseErrorLine({ code: "io", message: "denied" })).toBeNull();
    expect(parseErrorLine(null)).toBeNull();
  });
});

describe("XmlEditor", () => {
  it("mounts CodeMirror with the buffer text", () => {
    const { container } = render(<XmlEditor {...props({ text: "<root><a/></root>" })} />);
    expect(container.querySelector(".cm-content")).toBeInTheDocument();
    expect(container.textContent).toContain("<root>");
  });

  it("Ctrl-S triggers onSave", () => {
    const p = props();
    const { container } = render(<XmlEditor {...p} />);
    const view = container.querySelector(".cm-content") as HTMLElement;
    fireEvent.keyDown(view, { key: "s", ctrlKey: true });
    expect(p.onSave).toHaveBeenCalledTimes(1);
  });

  it("document changes propagate to onChange", () => {
    const p = props({ text: "<a/>" });
    const holder = captureView();
    render(<XmlEditor {...p} onViewReady={holder.ready} />);
    holder.view.dispatch({
      changes: { from: 0, to: holder.view.state.doc.length, insert: "<b/>" },
    });
    expect(p.onChange).toHaveBeenCalledWith("<b/>");
  });

  it("external text changes update the doc without echoing onChange", () => {
    const p = props({ text: "<a/>" });
    const holder = captureView();
    const { rerender } = render(<XmlEditor {...p} onViewReady={holder.ready} />);
    p.onChange.mockClear();
    rerender(<XmlEditor {...p} text="<b/>" onViewReady={holder.ready} />);
    expect(holder.view.state.doc.toString()).toBe("<b/>");
    expect(p.onChange).not.toHaveBeenCalled();
  });

  it("pretty mode formats, becomes read-only, and restores raw on toggle", () => {
    const p = props({ text: "<a><b>1</b></a>" });
    const holder = captureView();
    render(<XmlEditor {...p} onViewReady={holder.ready} />);
    p.onChange.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /pretty/i }));
    expect(holder.view.state.doc.toString()).toBe("<a>\n  <b>\n    1\n  </b>\n</a>");
    expect(holder.view.state.readOnly).toBe(true);
    expect(p.onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /pretty/i }));
    expect(holder.view.state.doc.toString()).toBe("<a><b>1</b></a>");
    expect(holder.view.state.readOnly).toBe(false);
  });

  it("honours the read-only prop (XmlViewer mode) while keeping pretty available", () => {
    const p = props({ text: "<a><b>1</b></a>", readOnly: true });
    const holder = captureView();
    render(<XmlEditor {...p} onViewReady={holder.ready} />);
    expect(holder.view.state.readOnly).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /pretty/i }));
    expect(holder.view.state.readOnly).toBe(true);
    expect(holder.view.state.doc.toString()).toBe("<a>\n  <b>\n    1\n  </b>\n</a>");

    fireEvent.click(screen.getByRole("button", { name: /pretty/i }));
    expect(holder.view.state.readOnly).toBe(true); // the prop wins over pretty-off
    expect(holder.view.state.doc.toString()).toBe("<a><b>1</b></a>");
  });

  it("shows an inline invalid_xml error with a line jump", () => {
    const saveError: AppError = {
      code: "invalid_xml",
      message: "save_entry A.res/B.set: line 3: mismatched tag",
      detail: "3",
    };
    const p = props({ text: "<a>\n<b>\n</a>\n", saveError });
    const holder = captureView();
    const { container } = render(<XmlEditor {...p} onViewReady={holder.ready} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/invalid_xml/);
    fireEvent.click(screen.getByRole("button", { name: /go to line 3/i }));

    const field = holder.view.state.field(lineHighlightField);
    expect(field.size).toBe(1);
    let lineNo = 0;
    field.between(0, holder.view.state.doc.length, (from) => {
      lineNo = holder.view.state.doc.lineAt(from).number;
      expect(container).toBeDefined();
    });
    expect(lineNo).toBe(3);
  });

  it("flashes a search-hit line and reports it consumed", () => {
    const p = props({ text: "l1\nl2\nl3" });
    const holder = captureView();
    const { rerender } = render(<XmlEditor {...p} onViewReady={holder.ready} />);
    rerender(<XmlEditor {...p} scrollLine={2} onViewReady={holder.ready} />);
    const field = holder.view.state.field(lineHighlightField);
    expect(field.size).toBe(1);
    expect(p.onScrollLineConsumed).toHaveBeenCalledTimes(1);
    let lineNo = 0;
    field.between(0, holder.view.state.doc.length, (from) => {
      lineNo = holder.view.state.doc.lineAt(from).number;
    });
    expect(lineNo).toBe(2);
  });
});
