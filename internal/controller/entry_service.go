package controller

import (
	"context"
	"fmt"
	"hash/crc32"
	"image/png"
	"os"

	"fanta-tennis-editor/internal/domain"
	"fanta-tennis-editor/internal/presenter"
	"github.com/icyzyy/fanta-tennis-res-kit/adapter/texenc"
	reskitdomain "github.com/icyzyy/fanta-tennis-res-kit/domain"
	"github.com/icyzyy/fanta-tennis-res-kit/usecase"
)

// Ports consumed by EntryService.
type entryReader interface {
	Do(ctx context.Context, archive, entry string) (*usecase.Content, error)
}

type entrySaver interface {
	Do(ctx context.Context, req usecase.SaveRequest) (*usecase.SaveResult, error)
}

type imagePreviewer interface {
	Do(ctx context.Context, archive, entry string) (*reskitdomain.Texture, []byte, error)
}

// entryReplacer is reskit's ArchiveRepo replace side (atomic in-place
// write + backup) — satisfied by the shared reszip repo in main.go.
type entryReplacer interface {
	Replace(archive, entry string, data []byte) error
}

// eventEmitter ships a named event payload to the frontend (*bridge.Bus
// satisfies it; declared here so controller never imports bridge).
type eventEmitter interface {
	Emit(name string, data any)
}

// EntryService binds entry reading, editing/repacking and texture preview.
type EntryService struct {
	reader   entryReader
	saver    entrySaver
	preview  imagePreviewer
	replacer entryReplacer
	events   eventEmitter
}

// NewEntryService wires the interactor ports.
func NewEntryService(reader entryReader, saver entrySaver, preview imagePreviewer, replacer entryReplacer, events eventEmitter) *EntryService {
	return &EntryService{reader: reader, saver: saver, preview: preview, replacer: replacer, events: events}
}

// ReadEntry decodes an entry by kind: .set → decrypted XML text,
// .tex → PNG bytes + texture metadata, other → UTF-8 text or raw bytes.
func (s *EntryService) ReadEntry(ctx context.Context, archive, entry string) (out *presenter.Content, err error) {
	defer recoverAs("read_entry", &err)
	c, err := s.reader.Do(ctx, archive, entry)
	if err != nil {
		return nil, err
	}
	return presenter.ContentOf(c), nil
}

// SaveEntry re-encrypts text and atomically replaces the entry inside the
// .res, then announces success on entry:saved (buffers, status bar).
func (s *EntryService) SaveEntry(ctx context.Context, req domain.SaveRequest) (out *domain.SaveResult, err error) {
	defer recoverAs("save_entry", &err)
	res, err := s.saver.Do(ctx, saveRequestOf(req))
	if err != nil {
		return nil, err
	}
	if res != nil && res.OK {
		s.events.Emit("entry:saved", presenter.EntrySaved{
			Archive:  req.Archive,
			Entry:    req.Entry,
			Revision: res.Revision,
		})
	}
	return saveResultOf(res), nil
}

// PreviewImage decodes an image entry (.tex/.dds/.bmp/.tga) to PNG +
// metadata through reskit's imgdecoder; shape matches ReadEntry's tex
// dispatch so the buffer store routes every image kind here.
func (s *EntryService) PreviewImage(ctx context.Context, archive, entry string) (out *presenter.Content, err error) {
	defer recoverAs("preview_image", &err)
	tex, png, err := s.preview.Do(ctx, archive, entry)
	if err != nil {
		return nil, err
	}
	return &presenter.Content{
		Kind: "png",
		Data: png,
		Texture: &presenter.Texture{
			Width:  tex.Width,
			Height: tex.Height,
			Format: tex.Format.String(),
		},
	}, nil
}

// ExportTexturePNG decodes a .tex through the preview path and writes the
// mip-0 PNG to Dest (path comes from the native save dialog).
func (s *EntryService) ExportTexturePNG(ctx context.Context, req domain.TextureExportRequest) (out *domain.TextureExportResult, err error) {
	defer recoverAs("export_texture", &err)
	_, pngBytes, err := s.preview.Do(ctx, req.Archive, req.Entry)
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(req.Dest, pngBytes, 0o644); err != nil {
		return nil, fmt.Errorf("export_texture %s/%s: %w", req.Archive, req.Entry, err)
	}
	return &domain.TextureExportResult{OK: true, Dest: req.Dest}, nil
}

// ImportTexturePNG replaces a .tex entry from a PNG on disk: the source
// must match the original's dimensions exactly and is re-encoded to the
// original format (full mip chain) via internal/texenc, then atomically
// replaced through the same repo path .set saving uses. The written bytes
// are re-read and re-decoded before success is reported — the discipline
// SaveEntry applies to text.
func (s *EntryService) ImportTexturePNG(ctx context.Context, req domain.TextureImportRequest) (out *domain.TextureImportResult, err error) {
	defer recoverAs("import_texture", &err)
	if reskitdomain.KindOf(req.Entry) != reskitdomain.KindTex {
		return nil, fmt.Errorf("import_texture %s/%s: %w", req.Archive, req.Entry, reskitdomain.ErrNotEditable)
	}
	meta, _, err := s.preview.Do(ctx, req.Archive, req.Entry)
	if err != nil {
		return nil, err
	}
	f, err := os.Open(req.Src)
	if err != nil {
		return nil, fmt.Errorf("import_texture %s/%s: %w", req.Archive, req.Entry, err)
	}
	defer f.Close()
	img, err := png.Decode(f)
	if err != nil {
		return nil, fmt.Errorf("import_texture %s/%s: decode png: %w", req.Archive, req.Entry, err)
	}
	if b := img.Bounds(); b.Dx() != meta.Width || b.Dy() != meta.Height {
		return nil, fmt.Errorf("import_texture %s/%s: dimension mismatch: got %dx%d, want %dx%d",
			req.Archive, req.Entry, b.Dx(), b.Dy(), meta.Width, meta.Height)
	}
	tex, err := texenc.Encode(img, meta.Format)
	if err != nil {
		return nil, fmt.Errorf("import_texture %s/%s: %w", req.Archive, req.Entry, err)
	}
	if err := s.replacer.Replace(req.Archive, req.Entry, tex); err != nil {
		return nil, fmt.Errorf("import_texture %s/%s: %w", req.Archive, req.Entry, err)
	}
	// Verify: re-read through the preview port and compare geometry.
	meta2, _, err := s.preview.Do(ctx, req.Archive, req.Entry)
	if err != nil {
		return nil, fmt.Errorf("import_texture %s/%s: %w: reread: %v", req.Archive, req.Entry, reskitdomain.ErrVerifyFailed, err)
	}
	if meta2.Width != meta.Width || meta2.Height != meta.Height || meta2.Format != meta.Format {
		return nil, fmt.Errorf("import_texture %s/%s: %w: geometry %dx%d/%v -> %dx%d/%v",
			req.Archive, req.Entry, reskitdomain.ErrVerifyFailed,
			meta.Width, meta.Height, meta.Format, meta2.Width, meta2.Height, meta2.Format)
	}
	rev := crc32.ChecksumIEEE(tex)
	s.events.Emit("texture:imported", presenter.TextureImported{
		Archive:  req.Archive,
		Entry:    req.Entry,
		Revision: rev,
	})
	return &domain.TextureImportResult{OK: true, Revision: rev}, nil
}
