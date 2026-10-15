import { EntryService } from "../../bindings/fanta-tennis-editor/internal/controller";
import type {
  Content,
  SaveRequest,
  SaveResult,
  TextureExportRequest,
  TextureExportResult,
  TextureImportRequest,
  TextureImportResult,
} from "./types";

/** Reads an entry: .set → decrypted XML, .tex → PNG, other → text/binary. */
export async function readEntry(archive: string, entry: string): Promise<Content> {
  return (await EntryService.ReadEntry(archive, entry)) as Content;
}

/** Re-encrypts and replaces the entry in place (in .res). */
export async function saveEntry(req: SaveRequest): Promise<SaveResult> {
  return (await EntryService.SaveEntry(req)) as SaveResult;
}

/** Decodes a .tex to PNG + metadata (same shape as readEntry on .tex). */
export async function previewImage(archive: string, entry: string): Promise<Content> {
  return (await EntryService.PreviewImage(archive, entry)) as Content;
}

/** Decodes a .tex and writes its mip-0 as a PNG file on disk. */
export async function exportTexturePng(req: TextureExportRequest): Promise<TextureExportResult> {
  return (await EntryService.ExportTexturePNG(req)) as TextureExportResult;
}

/**
 * Replaces a .tex entry with a PNG re-encoded to the original format and
 * dimensions (mismatched dimensions are rejected by the backend).
 */
export async function importTexturePng(req: TextureImportRequest): Promise<TextureImportResult> {
  return (await EntryService.ImportTexturePNG(req)) as TextureImportResult;
}
