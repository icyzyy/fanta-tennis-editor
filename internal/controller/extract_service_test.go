package controller

import (
	"context"
	"errors"
	"testing"

	"fanta-tennis-editor/internal/domain"
	"github.com/icyzyy/fanta-tennis-res-kit/usecase"
)

type fakeExtractor struct {
	req      usecase.ExtractRequest
	progress usecase.ProgressPort
	result   *usecase.ExtractResult
	err      error
}

func (f *fakeExtractor) Do(ctx context.Context, req usecase.ExtractRequest, progress usecase.ProgressPort) (*usecase.ExtractResult, error) {
	f.req, f.progress = req, progress
	return f.result, f.err
}

func TestExtractForwardsRequestAndProgress(t *testing.T) {
	extractor := &fakeExtractor{result: &usecase.ExtractResult{Files: []string{"/tmp/x/A.set"}}}
	progress := &fakeProgress{}
	svc := NewExtractService(extractor, progress)

	res, err := svc.Extract(context.Background(), domain.ExtractRequest{
		Archive: "A.res", Entries: []string{"a.set"}, Dest: "/tmp/x", Decrypted: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Files) != 1 || res.Files[0] != "/tmp/x/A.set" {
		t.Fatalf("result = %+v", res)
	}
	if extractor.req.Archive != "A.res" || extractor.req.Dest != "/tmp/x" || !extractor.req.Decrypted {
		t.Fatalf("request = %+v", extractor.req)
	}
	if extractor.progress != progress {
		t.Fatal("progress port must be forwarded")
	}
}

func TestExtractPropagatesError(t *testing.T) {
	want := errors.New("bad destination")
	svc := NewExtractService(&fakeExtractor{err: want}, &fakeProgress{})
	if _, err := svc.Extract(context.Background(), domain.ExtractRequest{Dest: "/x"}); !errors.Is(err, want) {
		t.Fatalf("err = %v", err)
	}
}
