package presenter

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/icyzyy/fanta-tennis-res-kit/domain"
	"github.com/icyzyy/fanta-tennis-res-kit/usecase"
)

func TestEntryOfMapsKindToStringAndKeepsMetadata(t *testing.T) {
	got := EntryOf(usecase.EntryInfo{
		Name:             "Gui_Login.set",
		Kind:             domain.KindSet,
		CompressedSize:   1200,
		UncompressedSize: 4096,
		Method:           8,
		ModTime:          1_700_000_000,
	})
	if got.Kind != "set" {
		t.Fatalf("kind = %q, want %q", got.Kind, "set")
	}
	if got.Name != "Gui_Login.set" || got.CompressedSize != 1200 ||
		got.UncompressedSize != 4096 || got.Method != 8 || got.ModTime != 1_700_000_000 {
		t.Fatalf("metadata lost: %+v", got)
	}
	b, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	var wire map[string]any
	if err := json.Unmarshal(b, &wire); err != nil {
		t.Fatal(err)
	}
	if wire["kind"] != "set" { // must be a JSON string, not the int enum
		t.Fatalf("wire kind = %#v", wire["kind"])
	}
}

func TestEntryOfOtherAndTexKinds(t *testing.T) {
	if EntryOf(usecase.EntryInfo{Kind: domain.KindTex}).Kind != "tex" {
		t.Fatal("tex kind not mapped")
	}
	if EntryOf(usecase.EntryInfo{Kind: domain.KindOther}).Kind != "other" {
		t.Fatal("other kind not mapped")
	}
}

func TestEntriesOfNilYieldsEmptySlice(t *testing.T) {
	got := EntriesOf(nil)
	if got == nil || len(got) != 0 {
		t.Fatalf("EntriesOf(nil) = %#v, want empty non-nil", got)
	}
}

func TestContentOfNil(t *testing.T) {
	if ContentOf(nil) != nil {
		t.Fatal("ContentOf(nil) must be nil")
	}
}

func TestContentOfXML(t *testing.T) {
	got := ContentOf(&usecase.Content{Kind: usecase.ContentXML, Text: "<a/>"})
	if got == nil || got.Kind != "xml" || got.Text != "<a/>" || got.Texture != nil {
		t.Fatalf("ContentOf = %+v", got)
	}
	b, _ := json.Marshal(got)
	var wire map[string]any
	_ = json.Unmarshal(b, &wire)
	if wire["kind"] != "xml" {
		t.Fatalf("wire kind = %#v", wire["kind"])
	}
	if _, ok := wire["data"]; ok { // omitempty on binary payload
		t.Fatalf("empty data must be omitted: %#v", wire)
	}
}

func TestContentOfPNGNormalisesTexture(t *testing.T) {
	got := ContentOf(&usecase.Content{
		Kind:    usecase.ContentPNG,
		Data:    []byte{0x89, 0x50},
		Texture: &domain.Texture{Width: 256, Height: 128, Format: domain.FmtDXT1},
	})
	if got.Kind != "png" || got.Texture == nil {
		t.Fatalf("ContentOf = %+v", got)
	}
	if got.Texture.Width != 256 || got.Texture.Height != 128 || got.Texture.Format != "DXT1" {
		t.Fatalf("texture = %+v", got.Texture)
	}
	b, _ := json.Marshal(got)
	var wire struct {
		Kind    string `json:"kind"`
		Data    string `json:"data"`
		Texture struct {
			Width  int    `json:"width"`
			Height int    `json:"height"`
			Format string `json:"format"`
		} `json:"texture"`
	}
	if err := json.Unmarshal(b, &wire); err != nil {
		t.Fatal(err)
	}
	if wire.Kind != "png" || wire.Texture.Format != "DXT1" ||
		wire.Texture.Width != 256 || wire.Texture.Height != 128 {
		t.Fatalf("wire = %+v", wire)
	}
	if wire.Data == "" { // []byte → base64 string
		t.Fatal("data must serialise to base64")
	}
}

func TestContentOfTruncatesBinaryAt1MiB(t *testing.T) {
	in := bytes.Repeat([]byte{0xAB}, MaxPreviewBytes+1024)
	got := ContentOf(&usecase.Content{Kind: usecase.ContentBinary, Data: in})
	if !got.Truncated || got.TotalBytes != int64(len(in)) {
		t.Fatalf("truncated=%v totalBytes=%d, want true/%d",
			got.Truncated, got.TotalBytes, len(in))
	}
	if len(got.Data) != MaxPreviewBytes {
		t.Fatalf("data len = %d, want %d", len(got.Data), MaxPreviewBytes)
	}
}

func TestContentOfTruncatesTextKeepsValidUTF8(t *testing.T) {
	// Multi-byte runes everywhere: the cut must not leave a partial rune.
	in := strings.Repeat("世界あ", MaxPreviewBytes) // 9 bytes per repeat
	got := ContentOf(&usecase.Content{Kind: usecase.ContentText, Text: in})
	if !got.Truncated || got.TotalBytes != int64(len(in)) {
		t.Fatalf("truncated=%v totalBytes=%d, want true/%d",
			got.Truncated, got.TotalBytes, len(in))
	}
	if !utf8.ValidString(got.Text) {
		t.Fatal("truncated text must stay valid UTF-8")
	}
	if len(got.Text) > MaxPreviewBytes {
		t.Fatalf("text len = %d, want <= %d", len(got.Text), MaxPreviewBytes)
	}
}

func TestContentOfNeverCapsXMLorPNG(t *testing.T) {
	xmlText := strings.Repeat("x", MaxPreviewBytes+1)
	got := ContentOf(&usecase.Content{Kind: usecase.ContentXML, Text: xmlText})
	if got.Truncated || got.Text != xmlText {
		t.Fatalf("xml capped: truncated=%v len=%d, want false/%d",
			got.Truncated, len(got.Text), len(xmlText))
	}
	png := bytes.Repeat([]byte{1}, MaxPreviewBytes+1)
	gotPNG := ContentOf(&usecase.Content{Kind: usecase.ContentPNG, Data: png})
	if gotPNG.Truncated || len(gotPNG.Data) != len(png) {
		t.Fatalf("png capped: truncated=%v len=%d, want false/%d",
			gotPNG.Truncated, len(gotPNG.Data), len(png))
	}
}
