import { ExePatchService } from "../../bindings/fanta-tennis-editor/internal/controller";
import type { ExeState } from "./types";

/** Reads every setting live from the binary; the Go service remembers the path. */
export async function openExe(path: string): Promise<ExeState> {
  return (await ExePatchService.OpenExe(path)) as ExeState;
}

/** Applies one setting (and, when name is non-empty, the custom-DLL rename); returns the freshly re-resolved state. */
export async function applyExeSetting(id: string, value: string, name: string): Promise<ExeState> {
  return (await ExePatchService.ApplyExeSetting(id, value, name)) as ExeState;
}
