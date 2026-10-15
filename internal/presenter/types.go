// Package presenter converts reskit boundary types into the JSON view models
// the frontend consumes: string enums, normalised texture metadata, event
// payloads, and AppError marshalling for the Wails error channel.
package presenter

// Entry is the wire view of one archive entry (kind as a string).
type Entry struct {
	Name             string `json:"name"`
	Kind             string `json:"kind"` // "set" | "tex" | "other"
	CompressedSize   int64  `json:"compressedSize"`
	UncompressedSize int64  `json:"uncompressedSize"`
	Method           uint16 `json:"method"`
	ModTime          int64  `json:"modTime"` // unix seconds
}

// Content is the wire view of a read entry. Kind selects the payload:
// "xml"/"text" → Text, "png" → Data (base64) + Texture, "binary" → Data.
type Content struct {
	Kind    string   `json:"kind"` // "xml" | "png" | "text" | "binary"
	Text    string   `json:"text,omitempty"`
	Data    []byte   `json:"data,omitempty"`
	Texture *Texture `json:"texture,omitempty"`
	// Truncated is set when a text/binary preview was capped at
	// MaxPreviewBytes; TotalBytes is the entry's original size so the UI
	// can report "first N of M — use Extract for a full copy". XML
	// (editable) and PNG (image) are never capped.
	Truncated  bool  `json:"truncated,omitempty"`
	TotalBytes int64 `json:"totalBytes,omitempty"`
}

// Texture normalises domain.Texture for JSON (domain has no json tags).
type Texture struct {
	Width  int    `json:"width"`
	Height int    `json:"height"`
	Format string `json:"format"` // "DXT1" | "DXT3" | "DXT5" | "Raw"
}

// ProgressNotice is the payload of the progress events
// (workspace:discovered, search:progress, extract:progress).
type ProgressNotice struct {
	Op    string `json:"op"`
	Done  int    `json:"done"`
	Total int    `json:"total"`
	Path  string `json:"path,omitempty"`
	Err   string `json:"err,omitempty"`
}

// EntrySaved is the payload of the entry:saved event.
type EntrySaved struct {
	Archive  string `json:"archive"`
	Entry    string `json:"entry"`
	Revision uint32 `json:"revision"`
}

// SearchSummary is the bound-method result of a search run. Cancelled is
// true when the caller cancelled mid-run (the controller swallows the ctx
// error so the cancelled promise resolves instead of rejecting).
type SearchSummary struct {
	Hits      int  `json:"hits"`
	Warnings  int  `json:"warnings"`
	Cancelled bool `json:"cancelled"`
}

// TextureImported is the payload of the texture:imported event (frontend
// refreshes any open preview of the replaced texture).
type TextureImported struct {
	Archive  string `json:"archive"`
	Entry    string `json:"entry"`
	Revision uint32 `json:"revision"`
}
