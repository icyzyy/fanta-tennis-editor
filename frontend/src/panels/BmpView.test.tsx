import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BmpView } from "./BmpView";

describe("BmpView", () => {
  it("hands the raw payload to the webview's native BMP codec", () => {
    render(<BmpView data="Qk02AA==" />);
    const img = screen.getByRole("img", { name: "bmp preview" });
    expect(img).toHaveAttribute("src", "data:image/bmp;base64,Qk02AA==");
  });

  it("shows a placeholder without payload", () => {
    render(<BmpView />);
    expect(screen.getByText("no payload")).toBeInTheDocument();
  });

  it("falls back to an extract hint when the engine cannot render", () => {
    render(<BmpView data="AAAA" />);
    fireEvent.error(screen.getByRole("img", { name: "bmp preview" }));
    expect(screen.getByText(/could not render/i)).toBeInTheDocument();
  });
});
