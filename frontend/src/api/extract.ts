import { ExtractService } from "../../bindings/fanta-tennis-editor/internal/controller";
import type { ExtractRequest, ExtractResult } from "./types";

/** Exports entries to dest; progress streams on extract:progress. */
export async function extract(req: ExtractRequest): Promise<ExtractResult> {
  return (await ExtractService.Extract(req)) as ExtractResult;
}
