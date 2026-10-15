package controller

import (
	"context"
	"errors"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"fanta-tennis-editor/internal/domain"
	"fanta-tennis-editor/internal/presenter"
	"github.com/icyzyy/fanta-tennis-res-kit/adapter/texdecoder"
	reskitdomain "github.com/icyzyy/fanta-tennis-res-kit/domain"
)

type fakeReplacer struct {
	calls          int
	archive, entry string
	data           []byte
	err            error
}

func (f *fakeReplacer) Replace(archive, entry string, data []byte) error {
	f.calls++
	f.archive, f.entry, f.data = archive, entry, data
	return f.err
}

// seqPreviewer returns metas/pngs in order, repeating the last.
type seqPreviewer struct {
	metas []*reskitdomain.Texture
	pngs  [][]byte
	calls int
}

func (f *seqPreviewer) Do(ctx context.Context, archive, entry string) (*reskitdomain.Texture, []byte, error) {
	i := f.calls
	if i >= len(f.metas) {
		i = len(f.metas) - 1
	}
	f.calls++
	var pngBytes []byte
	if i < len(f.pngs) {
		pngBytes = f.pngs[i]
	}
	return f.metas[i], pngBytes, nil
}

func writePNG(t *testing.T, dir, name string, img image.Image) string {
	t.Helper()
	p := filepath.Join(dir, name)
	f, err := os.Create(p)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, img); err != nil {
		t.Fatal(err)
	}
	return p
}

func solidPNG(w, h int) *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.SetNRGBA(x, y, color.NRGBA{R: 200, G: 100, B: 50, A: 255})
		}
	}
	return img
}

func TestExportTexturePNGWritesFile(t *testing.T) {
	previewer := &fakePreviewer{
		tex: &reskitdomain.Texture{Width: 8, Height: 8, Format: reskitdomain.FmtDXT1},
		png: []byte{1, 2, 3},
	}
	svc := NewEntryService(&fakeReader{}, &fakeSaver{}, previewer, &fakeReplacer{}, &fakeEmitter{})
	dest := filepath.Join(t.TempDir(), "out.png")

	res, err := svc.ExportTexturePNG(context.Background(), domain.TextureExportRequest{
		Archive: "a.res", Entry: "t.tex", Dest: dest,
	})
	if err != nil {
		t.Fatalf("ExportTexturePNG: %v", err)
	}
	if !res.OK || res.Dest != dest {
		t.Fatalf("result %+v", res)
	}
	got, err := os.ReadFile(dest)
	if err != nil || string(got) != "\x01\x02\x03" {
		t.Fatalf("file %v, err %v", got, err)
	}
	if previewer.archive != "a.res" || previewer.entry != "t.tex" {
		t.Fatalf("previewed %s/%s", previewer.archive, previewer.entry)
	}
}

func TestExportTexturePNGPropagatesError(t *testing.T) {
	want := errors.New("boom")
	svc := NewEntryService(&fakeReader{}, &fakeSaver{}, &fakePreviewer{err: want}, &fakeReplacer{}, &fakeEmitter{})
	if _, err := svc.ExportTexturePNG(context.Background(), domain.TextureExportRequest{
		Archive: "a.res", Entry: "t.tex", Dest: filepath.Join(t.TempDir(), "x.png"),
	}); !errors.Is(err, want) {
		t.Fatalf("err %v, want %v", err, want)
	}
}

func TestImportTexturePNGRejectsNonTexEntry(t *testing.T) {
	replacer := &fakeReplacer{}
	svc := NewEntryService(&fakeReader{}, &fakeSaver{}, &fakePreviewer{}, replacer, &fakeEmitter{})
	_, err := svc.ImportTexturePNG(context.Background(), domain.TextureImportRequest{
		Archive: "a.res", Entry: "Gui_Login.set", Src: "ignored.png",
	})
	if !errors.Is(err, reskitdomain.ErrNotEditable) {
		t.Fatalf("err %v, want ErrNotEditable", err)
	}
	if replacer.calls != 0 {
		t.Fatalf("replacer called %d times", replacer.calls)
	}
}

func TestImportTexturePNGRejectsDimensionMismatch(t *testing.T) {
	previewer := &fakePreviewer{
		tex: &reskitdomain.Texture{Width: 8, Height: 8, Format: reskitdomain.FmtDXT1},
	}
	replacer := &fakeReplacer{}
	svc := NewEntryService(&fakeReader{}, &fakeSaver{}, previewer, replacer, &fakeEmitter{})
	src := writePNG(t, t.TempDir(), "small.png", solidPNG(4, 4))

	_, err := svc.ImportTexturePNG(context.Background(), domain.TextureImportRequest{
		Archive: "a.res", Entry: "t.tex", Src: src,
	})
	if err == nil || !strings.Contains(err.Error(), "dimension mismatch: got 4x4, want 8x8") {
		t.Fatalf("err %v, want dimension mismatch", err)
	}
	if replacer.calls != 0 {
		t.Fatalf("replacer called %d times", replacer.calls)
	}
}

func TestImportTexturePNGReplacesVerifiesAndEmits(t *testing.T) {
	previewer := &fakePreviewer{
		tex: &reskitdomain.Texture{Width: 8, Height: 8, Format: reskitdomain.FmtDXT1},
	}
	replacer := &fakeReplacer{}
	events := &fakeEmitter{}
	svc := NewEntryService(&fakeReader{}, &fakeSaver{}, previewer, replacer, events)
	src := writePNG(t, t.TempDir(), "in.png", solidPNG(8, 8))

	res, err := svc.ImportTexturePNG(context.Background(), domain.TextureImportRequest{
		Archive: "a.res", Entry: "t.tex", Src: src,
	})
	if err != nil {
		t.Fatalf("ImportTexturePNG: %v", err)
	}
	if !res.OK || res.Revision == 0 {
		t.Fatalf("result %+v", res)
	}
	if replacer.calls != 1 || replacer.archive != "a.res" || replacer.entry != "t.tex" {
		t.Fatalf("replacer %+v", replacer)
	}
	// The bytes written into the archive must themselves be a valid .tex.
	meta, _, decErr := texdecoder.New().Decode(replacer.data)
	if decErr != nil {
		t.Fatalf("written bytes do not decode: %v", decErr)
	}
	if meta.Width != 8 || meta.Height != 8 || meta.Format != reskitdomain.FmtDXT1 {
		t.Fatalf("written meta %+v, want 8x8 DXT1", meta)
	}
	if len(events.events) != 1 || events.events[0].name != "texture:imported" {
		t.Fatalf("events %+v", events.events)
	}
	if got, want := events.events[0].data, (presenter.TextureImported{
		Archive: "a.res", Entry: "t.tex", Revision: res.Revision,
	}); got != want {
		t.Fatalf("event payload %+v, want %+v", got, want)
	}
}

func TestImportTexturePNGVerifyFailureLeavesError(t *testing.T) {
	// Re-read reports different geometry → ErrVerifyFailed.
	previewer := &seqPreviewer{metas: []*reskitdomain.Texture{
		{Width: 8, Height: 8, Format: reskitdomain.FmtDXT1},
		{Width: 4, Height: 4, Format: reskitdomain.FmtDXT1},
	}}
	replacer := &fakeReplacer{}
	svc := NewEntryService(&fakeReader{}, &fakeSaver{}, previewer, replacer, &fakeEmitter{})
	src := writePNG(t, t.TempDir(), "in.png", solidPNG(8, 8))

	_, err := svc.ImportTexturePNG(context.Background(), domain.TextureImportRequest{
		Archive: "a.res", Entry: "t.tex", Src: src,
	})
	if !errors.Is(err, reskitdomain.ErrVerifyFailed) {
		t.Fatalf("err %v, want ErrVerifyFailed", err)
	}
}

func TestImportTexturePNGPropagatesReplaceError(t *testing.T) {
	previewer := &fakePreviewer{
		tex: &reskitdomain.Texture{Width: 8, Height: 8, Format: reskitdomain.FmtDXT1},
	}
	want := errors.New("disk full")
	replacer := &fakeReplacer{err: want}
	svc := NewEntryService(&fakeReader{}, &fakeSaver{}, previewer, replacer, &fakeEmitter{})
	src := writePNG(t, t.TempDir(), "in.png", solidPNG(8, 8))

	if _, err := svc.ImportTexturePNG(context.Background(), domain.TextureImportRequest{
		Archive: "a.res", Entry: "t.tex", Src: src,
	}); !errors.Is(err, want) {
		t.Fatalf("err %v, want %v", err, want)
	}
	if replacer.calls != 1 {
		t.Fatalf("replacer called %d times", replacer.calls)
	}
}
