import { describe, expect, it } from "vitest";
import { isCancel, toAppError } from "./errors";

describe("toAppError", () => {
  it("reads RuntimeError.cause when present", () => {
    const cause = { code: "invalid_xml", message: "save A/B: line 42: x", detail: "42" };
    const err = Object.assign(new Error("raw"), { cause });
    expect(toAppError(err)).toEqual(cause);
  });

  it("falls back to the message without a structured cause", () => {
    expect(toAppError(new Error("boom"))).toEqual({ code: "internal", message: "boom" });
  });

  it("handles non-error values", () => {
    expect(toAppError("plain")).toEqual({ code: "internal", message: "plain" });
    expect(toAppError(undefined)).toEqual({ code: "internal", message: "undefined" });
  });

  it("ignores malformed cause", () => {
    const err = Object.assign(new Error("m"), { cause: "not-an-object" });
    expect(toAppError(err)).toEqual({ code: "internal", message: "m" });
  });
});

describe("isCancel", () => {
  it("detects CancelError by name", () => {
    const e = new Error("cancelled");
    e.name = "CancelError";
    expect(isCancel(e)).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isCancel(new Error("x"))).toBe(false);
    expect(isCancel({ code: "io" })).toBe(false);
  });
});
