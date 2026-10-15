import { Events } from "@wailsio/runtime";
import type { EntrySaved, ProgressNotice, SearchHit } from "./types";

// Typed subscriptions over the runtime bus. Every wrapper returns its
// unsubscribe function (call from React effect cleanups).

export function onWorkspaceDiscovered(cb: (n: ProgressNotice) => void): () => void {
  return Events.On("workspace:discovered", (ev) => cb(ev.data as ProgressNotice));
}

export function onSearchProgress(cb: (n: ProgressNotice) => void): () => void {
  return Events.On("search:progress", (ev) => cb(ev.data as ProgressNotice));
}

export function onSearchHit(cb: (h: SearchHit) => void): () => void {
  return Events.On("search:hit", (ev) => cb(ev.data as SearchHit));
}

export function onEntrySaved(cb: (s: EntrySaved) => void): () => void {
  return Events.On("entry:saved", (ev) => cb(ev.data as EntrySaved));
}

export function onExtractProgress(cb: (n: ProgressNotice) => void): () => void {
  return Events.On("extract:progress", (ev) => cb(ev.data as ProgressNotice));
}
