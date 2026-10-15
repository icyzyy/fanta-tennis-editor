import "@testing-library/jest-dom/vitest";

// jsdom performs no layout. Virtualized lists (@tanstack/react-virtual)
// synchronously read the scroll element's offsetWidth/offsetHeight on mount
// and would otherwise see a 0-height viewport and render zero rows. Give
// every element a fixed viewport size; the stub ResizeObserver never fires,
// so these getters stay the only source of truth.
for (const prop of ["offsetWidth", "offsetHeight"] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, {
    configurable: true,
    get: () => (prop === "offsetWidth" ? 1024 : 768),
  });
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver === "undefined") {
  (globalThis as { ResizeObserver: unknown }).ResizeObserver =
    ResizeObserverStub;
}
