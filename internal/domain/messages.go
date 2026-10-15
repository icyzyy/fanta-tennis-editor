// Package domain holds the editor's own boundary messages: the plain
// structs that cross the Wails binding edge (service parameters/results and
// event payloads). They deliberately mirror the engine's wire shapes —
// identical JSON tags — so the generated bindings never expose reskit
// types; controllers convert at the edge (internal/controller/mapping.go).
package domain

// Workspace is the result of opening a workspace: the root the user picked
// and every *.res archive discovered beneath it.
type Workspace struct {
	Root     string        `json:"root"`
	Archives []ArchiveInfo `json:"archives"`
}

// ArchiveInfo summarises one discovered .res archive.
type ArchiveInfo struct {
	Path    string `json:"path"`
	Size    int64  `json:"size"`
	ModTime int64  `json:"modTime"` // unix seconds
}

// SaveRequest carries the edited text to re-encrypt into an entry.
type SaveRequest struct {
	Archive string `json:"archive"`
	Entry   string `json:"entry"`
	Text    string `json:"text"`
}

// SaveResult confirms an in-place replace; Revision is the new entry
// revision inside the archive.
type SaveResult struct {
	OK       bool   `json:"ok"`
	Revision uint32 `json:"revision"`
}

// SearchRequest describes one global search run. Archive restricts the run
// to a single .res; CaseSensitive toggles matching.
type SearchRequest struct {
	Root          string `json:"root"`
	Archive       string `json:"archive,omitempty"`
	Query         string `json:"query"`
	CaseSensitive bool   `json:"caseSensitive"`
}

// SearchHit is one streamed result (or Warning for an unreadable archive).
type SearchHit struct {
	Archive string `json:"archive"`
	Entry   string `json:"entry,omitempty"`
	Line    int    `json:"line,omitempty"`
	Text    string `json:"text,omitempty"`
	Warning string `json:"warning,omitempty"`
}

// ExtractRequest exports entries (or the whole archive when Entries is
// empty) to Dest, optionally decrypted.
type ExtractRequest struct {
	Archive   string   `json:"archive"`
	Entries   []string `json:"entries,omitempty"`
	Dest      string   `json:"dest"`
	Decrypted bool     `json:"decrypted"`
}

// ExtractResult lists the files written.
type ExtractResult struct {
	Files []string `json:"files"`
}

// TextureExportRequest saves a decoded .tex (mip-0) as a PNG file on disk.
type TextureExportRequest struct {
	Archive string `json:"archive"`
	Entry   string `json:"entry"`
	Dest    string `json:"dest"`
}

// TextureExportResult confirms the PNG was written.
type TextureExportResult struct {
	OK   bool   `json:"ok"`
	Dest string `json:"dest"`
}

// TextureImportRequest replaces a .tex entry with a PNG re-encoded to the
// original's format and dimensions (mismatched dimensions are rejected).
type TextureImportRequest struct {
	Archive string `json:"archive"`
	Entry   string `json:"entry"`
	Src     string `json:"src"`
}

// TextureImportResult confirms the in-place replace. Revision is CRC32 of
// the stored .tex bytes (informational token, like SaveResult).
type TextureImportResult struct {
	OK       bool   `json:"ok"`
	Revision uint32 `json:"revision"`
}
