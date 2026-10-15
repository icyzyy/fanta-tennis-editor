import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HexView } from "./HexView";

function row(container: HTMLElement, i: number): HTMLElement | null {
  return container.querySelector(`[data-row="${i}"]`);
}

describe("HexView", () => {
  it("decodes base64 into offset/hex/ascii rows", () => {
    // bytes: 00 01 02 ff 41 ("....A" in ascii)
    const { container } = render(<HexView data={btoa([0, 1, 2, 0xff, 0x41].map((b) => String.fromCharCode(b)).join(""))} />);
    expect(screen.getByText("5 bytes")).toBeInTheDocument();
    const r0 = row(container, 0);
    expect(r0?.textContent).toContain("00000000  00 01 02 ff 41");
    expect(r0?.textContent).toContain("....A");
  });

  it("continues on the next 16-byte row with its offset", () => {
    const payload = Array.from({ length: 20 }, (_, i) => i);
    const { container } = render(
      <HexView data={btoa(payload.map((b) => String.fromCharCode(b)).join(""))} />,
    );
    expect(row(container, 1)?.textContent?.startsWith("00000010")).toBe(true);
  });

  it("caps at 65536 bytes with an explicit footer", () => {
    const { container } = render(<HexView data={btoa("x".repeat(70000))} />);
    expect(container.querySelectorAll("[data-row]").length).toBe(4096);
    expect(
      screen.getByText(/showing first 65536 of 70000 bytes/),
    ).toBeInTheDocument();
  });

  it("reports the original size when the presenter truncated at 1 MiB", () => {
    // presenter delivers at most 1 MiB; totalBytes carries the real size
    const payload = btoa("x".repeat(1048576));
    const { container } = render(
      <HexView data={payload} totalBytes={11315200} />,
    );
    expect(screen.getByText("11315200 bytes")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-row]").length).toBe(4096);
    expect(
      screen.getByText(/showing first 65536 of 11315200 bytes/),
    ).toBeInTheDocument();
  });

  it("renders an empty payload without crashing", () => {
    render(<HexView data="" />);
    expect(screen.getByText("0 bytes")).toBeInTheDocument();
    expect(screen.getByText("empty payload")).toBeInTheDocument();
  });
});
