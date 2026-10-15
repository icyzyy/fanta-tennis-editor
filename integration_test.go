//go:build integration

package main

// Opt-in end-to-end check of the composed graph against a READ-ONLY corpus:
//
//	FANTA_RES_DIR=/path/to/client/Res \
//	  CGO_ENABLED=1 go test -tags=integration -run TestIntegration -v .
//
// Never writes into the corpus: SaveEntry is not exercised (repack safety is
// covered by reskit's own tests with temp copies) and extraction targets
// t.TempDir().
import (
	"bytes"
	"context"
	"image/png"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"fanta-tennis-editor/internal/bridge"
	"fanta-tennis-editor/internal/domain"
	"github.com/icyzyy/fanta-tennis-res-kit/adapter/imgdecoder"
	"github.com/icyzyy/fanta-tennis-res-kit/adapter/reszip"
	"github.com/icyzyy/fanta-tennis-res-kit/adapter/texdecoder"
	"github.com/icyzyy/fanta-tennis-res-kit/adapter/texenc"
)

type countingEmitter struct {
	mu     sync.Mutex
	counts map[string]int
}

func (c *countingEmitter) Emit(name string, data any) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.counts == nil {
		c.counts = map[string]int{}
	}
	c.counts[name]++
}

func (c *countingEmitter) count(name string) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.counts[name]
}

func TestIntegrationReadOnlyCorpus(t *testing.T) {
	root := os.Getenv("FANTA_RES_DIR")
	if root == "" {
		t.Skip("FANTA_RES_DIR not set")
	}
	ctx := context.Background()

	emitter := &countingEmitter{}
	bus := bridge.New()
	bus.Connect(emitter)
	g := buildGraph(bus)

	// 1. Discover the workspace; per-archive progress streams on
	//    workspace:discovered.
	ws, err := g.workspace.OpenWorkspace(ctx, root)
	if err != nil {
		t.Fatalf("OpenWorkspace: %v", err)
	}
	if len(ws.Archives) == 0 {
		t.Fatalf("no archives under %s", root)
	}
	if emitter.count("workspace:discovered") == 0 {
		t.Fatal("expected workspace:discovered progress events")
	}

	// 2. Locate one .set and one .tex entry (bounded scan).
	var setArchive, setEntry, texArchive, texEntry string
	for _, a := range ws.Archives[:min(len(ws.Archives), 100)] {
		if setArchive != "" && texArchive != "" {
			break
		}
		entries, err := g.workspace.ListEntries(ctx, a.Path)
		if err != nil {
			continue // unreadable archive — skipped, search will warn
		}
		for _, e := range entries {
			if e.Kind == "set" && setArchive == "" {
				setArchive, setEntry = a.Path, e.Name
			}
			if e.Kind == "tex" && texArchive == "" {
				texArchive, texEntry = a.Path, e.Name
			}
		}
	}
	if setArchive == "" {
		t.Skip("no .set entry in the first 100 archives")
	}

	// 3. Read + decrypt the .set entry.
	content, err := g.entry.ReadEntry(ctx, setArchive, setEntry)
	if err != nil {
		t.Fatalf("ReadEntry %s/%s: %v", setArchive, setEntry, err)
	}
	if content.Kind != "xml" || content.Text == "" {
		t.Fatalf("content kind=%q text=%d bytes", content.Kind, len(content.Text))
	}

	// 4. Preview the .tex entry → PNG bytes + metadata.
	if texArchive != "" {
		prev, err := g.entry.PreviewImage(ctx, texArchive, texEntry)
		if err != nil {
			t.Fatalf("PreviewImage %s/%s: %v", texArchive, texEntry, err)
		}
		if prev.Kind != "png" || prev.Texture == nil || len(prev.Data) == 0 {
			t.Fatalf("preview kind=%q texture=%+v data=%d", prev.Kind, prev.Texture, len(prev.Data))
		}
		if prev.Data[0] != 0x89 || string(prev.Data[1:4]) != "PNG" {
			t.Fatalf("preview payload is not a PNG (magic % x)", prev.Data[:4])
		}
	}

	// 5. Scoped search over one archive; hits stream as search:hit events.
	summary, err := g.search.SearchAll(ctx, domain.SearchRequest{
		Root:    root,
		Archive: setArchive,
		Query:   "a",
	})
	if err != nil {
		t.Fatalf("SearchAll: %v", err)
	}
	if got := emitter.count("search:hit"); got != summary.Hits+summary.Warnings {
		t.Fatalf("search:hit events=%d, summary=%+v", got, summary)
	}
	if emitter.count("search:progress") == 0 {
		t.Fatal("expected a final search:progress event")
	}

	// 6. Extract exactly one entry (decrypted) into a temp dir — corpus
	//    untouched; output must equal the decrypted read.
	dest := t.TempDir()
	res, err := g.extract.Extract(ctx, domain.ExtractRequest{
		Archive: setArchive, Entries: []string{setEntry}, Dest: dest, Decrypted: true,
	})
	if err != nil {
		t.Fatalf("Extract: %v", err)
	}
	if len(res.Files) != 1 {
		t.Fatalf("extracted %d files, want 1: %v", len(res.Files), res.Files)
	}
	raw, err := os.ReadFile(res.Files[0])
	if err != nil {
		t.Fatalf("read extract: %v", err)
	}
	if string(raw) != content.Text {
		t.Fatal("decrypted extract must equal the decrypted read")
	}
	if emitter.count("extract:progress") == 0 {
		t.Fatal("expected extract:progress events")
	}

	// 7. Texture encoder round-trip against a real corpus texture: decode,
	//    re-encode via adapter/texenc, decode again — geometry must survive.
	//    Read-only: no replacement is attempted on the corpus.
	if texArchive != "" {
		repo := reszip.New()
		rawTex, err := repo.Read(texArchive, texEntry)
		if err != nil {
			t.Fatalf("raw read %s/%s: %v", texArchive, texEntry, err)
		}
		dec := texdecoder.New()
		meta, pngBytes, err := dec.Decode(rawTex)
		if err != nil {
			t.Fatalf("decode %s/%s: %v", texArchive, texEntry, err)
		}
		img, err := png.Decode(bytes.NewReader(pngBytes))
		if err != nil {
			t.Fatalf("png decode: %v", err)
		}
		reencoded, err := texenc.Encode(img, meta.Format)
		if err != nil {
			t.Fatalf("re-encode %s/%s (%v): %v", texArchive, texEntry, meta.Format, err)
		}
		meta2, _, err := dec.Decode(reencoded)
		if err != nil {
			t.Fatalf("re-decode re-encoded tex: %v", err)
		}
		if meta2.Width != meta.Width || meta2.Height != meta.Height || meta2.Format != meta.Format {
			t.Fatalf("round-trip geometry %+v -> %+v", meta, meta2)
		}
	}
}

// TestIntegrationAllImageEntriesDecode walks the corpus and decodes every
// image entry (.tex/.dds/.bmp/.tga) through reskit's imgdecoder — read-only,
// no writes anywhere. Pins the known leftover-image counts so a corpus or
// decoder regression is loud.
func TestIntegrationAllImageEntriesDecode(t *testing.T) {
	root := os.Getenv("FANTA_RES_DIR")
	if root == "" {
		t.Skip("FANTA_RES_DIR not set")
	}
	repo := reszip.New()
	dec := imgdecoder.New()
	counts := map[string]int{}
	// Known reskit gap (reported upstream): one corpus texture is uncompressed
	// 32bpp RGBX (a-mask 0x00000000) which texdecoder rejects. Pin it by name
	// so any OTHER decode failure still fails this test.
	knownGap := map[string]bool{
		"Player/Common/Tex24.res::CommonRacket56.tex": false,
	}
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(strings.ToLower(path), ".res") {
			return err
		}
		entries, lerr := repo.List(path)
		if lerr != nil {
			return nil // unreadable archive — skip like the app would
		}
		for _, e := range entries {
			ext := strings.ToLower(filepath.Ext(e.Name))
			switch ext {
			case ".tex", ".dds", ".bmp", ".tga":
			default:
				continue
			}
			data, rerr := repo.Read(path, e.Name)
			if rerr != nil {
				t.Errorf("read %s::%s: %v", path, e.Name, rerr)
				continue
			}
			meta, pngBytes, derr := dec.Decode(e.Name, data)
			if derr != nil {
				key := filepath.ToSlash(strings.TrimPrefix(path, root+"/")) + "::" + e.Name
				if _, known := knownGap[key]; known {
					knownGap[key] = true // seen, still unsupported
					t.Logf("known gap (reskit RGBX): %s", key)
					continue
				}
				t.Errorf("decode %s::%s: %v", path, e.Name, derr)
				continue
			}
			if meta.Width <= 0 || meta.Height <= 0 {
				t.Errorf("decode %s::%s: bad geometry %+v", path, e.Name, meta)
			}
			if !bytes.HasPrefix(pngBytes, []byte{0x89, 'P', 'N', 'G'}) {
				t.Errorf("decode %s::%s: not a PNG payload", path, e.Name)
			}
			counts[ext]++
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if counts[".tex"] == 0 {
		t.Fatal("no .tex decoded — corpus unreadable?")
	}
	if counts[".dds"] != 16 || counts[".tga"] != 4 || counts[".bmp"] != 2 {
		t.Errorf("leftover image counts changed: %v", counts)
	}
	decodedTex := counts[".tex"]
	if decodedTex+len(knownGap) != 5433 { // 5433 total tex; all but the gap decode
		t.Errorf("tex decode count drifted: %d (+%d gap) != 5433", decodedTex, len(knownGap))
	}
	t.Logf("decoded: %v", counts)
}
