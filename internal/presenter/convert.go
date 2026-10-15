package presenter

import (
	"strings"

	"github.com/icyzyy/fanta-tennis-res-kit/usecase"
)

// EntryOf converts a boundary entry to its wire view.
func EntryOf(e usecase.EntryInfo) Entry {
	return Entry{
		Name:             e.Name,
		Kind:             e.Kind.String(),
		CompressedSize:   e.CompressedSize,
		UncompressedSize: e.UncompressedSize,
		Method:           e.Method,
		ModTime:          e.ModTime,
	}
}

// EntriesOf converts a batch of boundary entries (empty slice for nil).
func EntriesOf(list []usecase.EntryInfo) []Entry {
	out := make([]Entry, 0, len(list))
	for _, e := range list {
		out = append(out, EntryOf(e))
	}
	return out
}

// MaxPreviewBytes caps text/binary previews before they cross the Wails
// IPC as JSON — the corpus's largest entry is ~11 MB (Mesh.res), which
// would otherwise arrive as a ~14 MB base64 string on the UI thread.
// XML (the editable payloads) and PNG (images) are never capped.
const MaxPreviewBytes = 1 << 20 // 1 MiB

// ContentOf converts boundary content to its wire view. Nil-safe.
// Text/binary payloads beyond MaxPreviewBytes are truncated and reported
// via Truncated/TotalBytes.
func ContentOf(c *usecase.Content) *Content {
	if c == nil {
		return nil
	}
	out := &Content{
		Kind: c.Kind.String(),
		Text: c.Text,
		Data: c.Data,
	}
	switch c.Kind {
	case usecase.ContentText:
		if len(out.Text) > MaxPreviewBytes {
			out.Truncated = true
			out.TotalBytes = int64(len(out.Text))
			// Drop any partial rune at the cut so the wire string
			// stays valid UTF-8.
			out.Text = strings.ToValidUTF8(out.Text[:MaxPreviewBytes], "")
		}
	case usecase.ContentBinary:
		if len(out.Data) > MaxPreviewBytes {
			out.Truncated = true
			out.TotalBytes = int64(len(out.Data))
			out.Data = out.Data[:MaxPreviewBytes]
		}
	}
	if c.Texture != nil {
		out.Texture = &Texture{
			Width:  c.Texture.Width,
			Height: c.Texture.Height,
			Format: c.Texture.Format.String(),
		}
	}
	return out
}
