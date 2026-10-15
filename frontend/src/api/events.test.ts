import { expect, it, vi } from "vitest";

const runtimeMock = vi.hoisted(() => {
  const listeners = new Map<string, (ev: { data: unknown }) => void>();
  return {
    listeners,
    On(name: string, cb: (ev: { data: unknown }) => void) {
      listeners.set(name, cb);
      return () => {
        listeners.delete(name);
      };
    },
    emit(name: string, data: unknown) {
      listeners.get(name)?.({ data });
    },
  };
});

vi.mock("@wailsio/runtime", () => ({ Events: { On: runtimeMock.On } }));

import {
  onEntrySaved,
  onExtractProgress,
  onSearchHit,
  onSearchProgress,
  onWorkspaceDiscovered,
} from "./events";
import type { EntrySaved, SearchHit } from "./types";

function noop() {
  /* subscription probe */
}

it("subscribes under the five registered names", () => {
  const offs = [
    onWorkspaceDiscovered(noop),
    onSearchProgress(noop),
    onSearchHit(noop),
    onEntrySaved(noop),
    onExtractProgress(noop),
  ];
  expect([...runtimeMock.listeners.keys()].sort()).toEqual([
    "entry:saved",
    "extract:progress",
    "search:hit",
    "search:progress",
    "workspace:discovered",
  ]);
  offs.forEach((off) => off());
  expect(runtimeMock.listeners.size).toBe(0);
});

it("delivers payloads and stops after unsubscribe", () => {
  const hits: SearchHit[] = [];
  const off = onSearchHit((h) => hits.push(h));
  runtimeMock.emit("search:hit", { archive: "A.res", text: "hi" });
  expect(hits).toEqual([{ archive: "A.res", text: "hi" }]);
  off();
  runtimeMock.emit("search:hit", { archive: "B.res" });
  expect(hits).toHaveLength(1);
});

it("delivers entry:saved payloads", () => {
  const saved: EntrySaved[] = [];
  const off = onEntrySaved((s) => saved.push(s));
  runtimeMock.emit("entry:saved", { archive: "A.res", entry: "b.set", revision: 9 });
  expect(saved).toEqual([{ archive: "A.res", entry: "b.set", revision: 9 }]);
  off();
});
