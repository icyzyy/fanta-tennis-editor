import { WorkspaceService } from "../../bindings/fanta-tennis-editor/internal/controller";
import type { Entry, Workspace } from "./types";

/** Discovers all .res archives recursively under root; progress streams on workspace:discovered. */
export async function openWorkspace(root: string): Promise<Workspace> {
  return (await WorkspaceService.OpenWorkspace(root)) as Workspace;
}

/** Lists one archive's entries (string kinds). */
export async function listEntries(archive: string): Promise<Entry[]> {
  return (await WorkspaceService.ListEntries(archive)) as Entry[];
}
