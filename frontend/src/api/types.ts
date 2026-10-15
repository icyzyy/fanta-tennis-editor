// Wire types mirroring the Go payloads (json tags → camelCase). The
// generated bindings import as `any`, so this file is the single TS source
// of truth for payload shapes (spec §4: api returns boundary-type shapes).

export interface ArchiveInfo {
  path: string;
  size: number;
  modTime: number; // unix seconds
}

export interface Workspace {
  root: string;
  archives: ArchiveInfo[];
}

export type EntryKind = "set" | "tex" | "other";

export interface Entry {
  name: string;
  kind: EntryKind;
  compressedSize: number;
  uncompressedSize: number;
  method: number;
  modTime: number;
}

export type ContentKind = "xml" | "png" | "text" | "binary";

export interface Texture {
  width: number;
  height: number;
  format: string; // "DXT1" | "DXT3" | "DXT5" | "Raw"
}

export interface Content {
  kind: ContentKind;
  text?: string; // xml/text payloads
  data?: string; // base64: png bytes / raw binary
  texture?: Texture;
  truncated?: boolean; // presenter capped this text/binary preview at 1 MiB
  totalBytes?: number; // original size when truncated (full copy via Extract)
}

export interface SaveRequest {
  archive: string;
  entry: string;
  text: string;
}

export interface SaveResult {
  ok: boolean;
  revision: number;
}

export interface SearchRequest {
  root: string;
  archive?: string; // narrows to one .res when set
  query: string;
  caseSensitive: boolean;
}

export interface SearchHit {
  archive: string;
  entry?: string;
  line?: number;
  text?: string;
  warning?: string;
}

export interface SearchSummary {
  hits: number;
  warnings: number;
  cancelled: boolean;
}

export interface ExtractRequest {
  archive: string;
  entries?: string[]; // empty/omitted = whole archive
  dest: string;
  decrypted: boolean;
}

export interface ExtractResult {
  files: string[];
}

export interface ProgressNotice {
  op: string;
  done: number;
  total: number;
  path?: string;
  err?: string;
}

export interface EntrySaved {
  archive: string;
  entry: string;
  revision: number;
}

export interface TextureExportRequest {
  archive: string;
  entry: string;
  dest: string; // absolute path from the native save dialog
}

export interface TextureExportResult {
  ok: boolean;
  dest: string;
}

export interface TextureImportRequest {
  archive: string;
  entry: string;
  src: string; // absolute path of the PNG to import
}

export interface TextureImportResult {
  ok: boolean;
  revision: number;
}

export interface ExeState {
  path: string;
  settings: ExeSetting[];
  md5: string; // last successful apply; "" after open
}

export interface ExeSetting {
  id: string;
  label: string;
  value: string;
  editable: boolean;
  reason: string; // why the setting is not editable; "" when editable
  maxLength: number; // 0 = enum setting (checkbox); text settings carry their hard cap
  name: string; // decoded DLL name; "" when absent/undecodable
  nameEditable: boolean; // name editable (setting editable + name decodes)
  nameReason: string; // why the name is not editable; "" when editable
}
