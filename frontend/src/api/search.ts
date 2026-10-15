import { SearchService } from "../../bindings/fanta-tennis-editor/internal/controller";
import type { SearchRequest, SearchSummary } from "./types";

/**
 * A search promise with the runtime's cancel(): rejects immediately with
 * CancelError, aborts the Go ctx; the late Go result (cancelled summary) is
 * discarded by the runtime.
 */
export interface CancellableSearch extends Promise<SearchSummary> {
  cancel(): void;
}

/** Starts a global search; hits arrive via search:hit events. */
export function searchAll(req: SearchRequest): CancellableSearch {
  return SearchService.SearchAll(req) as unknown as CancellableSearch;
}
