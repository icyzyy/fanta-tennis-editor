package controller

import (
	"context"
	"errors"
	"sync"
	"testing"

	"fanta-tennis-editor/internal/domain"
	"fanta-tennis-editor/internal/presenter"
	reskitdomain "github.com/icyzyy/fanta-tennis-res-kit/domain"
	"github.com/icyzyy/fanta-tennis-res-kit/usecase"
)

type fakeReader struct {
	content        *usecase.Content
	err            error
	archive, entry string
}

func (f *fakeReader) Do(ctx context.Context, archive, entry string) (*usecase.Content, error) {
	f.archive, f.entry = archive, entry
	return f.content, f.err
}

type fakeSaver struct {
	result *usecase.SaveResult
	err    error
	last   usecase.SaveRequest
}

func (f *fakeSaver) Do(ctx context.Context, req usecase.SaveRequest) (*usecase.SaveResult, error) {
	f.last = req
	return f.result, f.err
}

type fakePreviewer struct {
	tex            *reskitdomain.Texture
	png            []byte
	err            error
	archive, entry string
}

func (f *fakePreviewer) Do(ctx context.Context, archive, entry string) (*reskitdomain.Texture, []byte, error) {
	f.archive, f.entry = archive, entry
	return f.tex, f.png, f.err
}

type emitted struct {
	name string
	data any
}

// fakeEmitter is mutex-protected: SearchService emits from worker goroutines.
type fakeEmitter struct {
	mu     sync.Mutex
	events []emitted
}

func (f *fakeEmitter) Emit(name string, data any) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.events = append(f.events, emitted{name: name, data: data})
}

func TestReadEntryReturnsWireContent(t *testing.T) {
	reader := &fakeReader{content: &usecase.Content{Kind: usecase.ContentXML, Text: "<root/>"}}
	svc := NewEntryService(reader, &fakeSaver{}, &fakePreviewer{}, &fakeReplacer{}, &fakeEmitter{})

	got, err := svc.ReadEntry(context.Background(), "Gui3.res", "Gui_Login.set")
	if err != nil {
		t.Fatal(err)
	}
	if reader.archive != "Gui3.res" || reader.entry != "Gui_Login.set" {
		t.Fatalf("reader called with %q/%q", reader.archive, reader.entry)
	}
	if got.Kind != "xml" || got.Text != "<root/>" {
		t.Fatalf("content = %+v", got)
	}
}

func TestReadEntryPropagatesError(t *testing.T) {
	want := errors.New("boom")
	svc := NewEntryService(&fakeReader{err: want}, &fakeSaver{}, &fakePreviewer{}, &fakeReplacer{}, &fakeEmitter{})
	if _, err := svc.ReadEntry(context.Background(), "A.res", "b.set"); !errors.Is(err, want) {
		t.Fatalf("err = %v", err)
	}
}

func TestSaveEntryEmitsEntrySaved(t *testing.T) {
	saver := &fakeSaver{result: &usecase.SaveResult{OK: true, Revision: 0xDEADBEEF}}
	events := &fakeEmitter{}
	svc := NewEntryService(&fakeReader{}, saver, &fakePreviewer{}, &fakeReplacer{}, events)

	res, err := svc.SaveEntry(context.Background(), domain.SaveRequest{
		Archive: "Gui3.res", Entry: "Gui_Login.set", Text: "<a/>",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !res.OK || res.Revision != 0xDEADBEEF {
		t.Fatalf("result = %+v", res)
	}
	if saver.last.Archive != "Gui3.res" || saver.last.Entry != "Gui_Login.set" || saver.last.Text != "<a/>" {
		t.Fatalf("request = %+v", saver.last)
	}
	if len(events.events) != 1 || events.events[0].name != "entry:saved" {
		t.Fatalf("events = %+v", events.events)
	}
	saved, ok := events.events[0].data.(presenter.EntrySaved)
	if !ok {
		t.Fatalf("payload type %T", events.events[0].data)
	}
	if saved.Archive != "Gui3.res" || saved.Entry != "Gui_Login.set" || saved.Revision != 0xDEADBEEF {
		t.Fatalf("saved = %+v", saved)
	}
}

func TestSaveEntryFailureEmitsNothing(t *testing.T) {
	want := errors.New("invalid xml")
	saver := &fakeSaver{err: want}
	events := &fakeEmitter{}
	svc := NewEntryService(&fakeReader{}, saver, &fakePreviewer{}, &fakeReplacer{}, events)

	req := domain.SaveRequest{Archive: "A.res", Entry: "b.set", Text: "x"}
	if _, err := svc.SaveEntry(context.Background(), req); !errors.Is(err, want) {
		t.Fatalf("err = %v", err)
	}
	if len(events.events) != 0 {
		t.Fatalf("no event expected, got %+v", events.events)
	}
}

func TestPreviewImageBuildsPngContent(t *testing.T) {
	png := []byte{0x89, 0x50, 0x4E, 0x47}
	previewer := &fakePreviewer{
		tex: &reskitdomain.Texture{Width: 64, Height: 32, Format: reskitdomain.FmtDXT5},
		png: png,
	}
	svc := NewEntryService(&fakeReader{}, &fakeSaver{}, previewer, &fakeReplacer{}, &fakeEmitter{})

	got, err := svc.PreviewImage(context.Background(), "Item.res", "Icon.tex")
	if err != nil {
		t.Fatal(err)
	}
	if previewer.archive != "Item.res" || previewer.entry != "Icon.tex" {
		t.Fatalf("previewer called with %q/%q", previewer.archive, previewer.entry)
	}
	if got.Kind != "png" || got.Texture == nil {
		t.Fatalf("content = %+v", got)
	}
	if got.Texture.Width != 64 || got.Texture.Height != 32 || got.Texture.Format != "DXT5" {
		t.Fatalf("texture = %+v", got.Texture)
	}
	if len(got.Data) != 4 {
		t.Fatalf("data = %v", got.Data)
	}
}

func TestPreviewImagePropagatesError(t *testing.T) {
	want := errors.New("not a texture")
	svc := NewEntryService(&fakeReader{}, &fakeSaver{}, &fakePreviewer{err: want}, &fakeReplacer{}, &fakeEmitter{})
	if _, err := svc.PreviewImage(context.Background(), "A.res", "b.tex"); !errors.Is(err, want) {
		t.Fatalf("err = %v", err)
	}
}
