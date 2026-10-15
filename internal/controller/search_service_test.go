package controller

import (
	"context"
	"errors"
	"sync"
	"testing"

	"fanta-tennis-editor/internal/domain"
	"github.com/icyzyy/fanta-tennis-res-kit/usecase"
)

type fakeSearcher struct {
	req      usecase.SearchRequest
	progress usecase.ProgressPort
	retErr   error
	hits     []usecase.SearchHit // injected from Do
}

func (f *fakeSearcher) Do(ctx context.Context, req usecase.SearchRequest, emit func(usecase.SearchHit), progress usecase.ProgressPort) error {
	f.req, f.progress = req, progress
	for _, h := range f.hits {
		emit(h)
	}
	return f.retErr
}

// searcherFunc adapts a function to entrySearcher (concurrency probe).
type searcherFunc func(ctx context.Context, req usecase.SearchRequest, emit func(usecase.SearchHit), progress usecase.ProgressPort) error

func (f searcherFunc) Do(ctx context.Context, req usecase.SearchRequest, emit func(usecase.SearchHit), progress usecase.ProgressPort) error {
	return f(ctx, req, emit, progress)
}

type fakeProgress struct{ events []usecase.ProgressEvent }

func (f *fakeProgress) Report(ev usecase.ProgressEvent) { f.events = append(f.events, ev) }

func TestSearchAllStreamsHitsAndCounts(t *testing.T) {
	searcher := &fakeSearcher{hits: []usecase.SearchHit{
		{Archive: "A.res", Entry: "x.set", Line: 1, Text: "match"},
		{Archive: "B.res", Entry: "y.set", Line: 2, Text: "match"},
		{Archive: "C.res", Warning: "unreadable"},
	}}
	progress := &fakeProgress{}
	events := &fakeEmitter{}
	svc := NewSearchService(searcher, progress, events)

	summary, err := svc.SearchAll(context.Background(), domain.SearchRequest{
		Root: "/r", Query: "match",
	})
	if err != nil {
		t.Fatal(err)
	}
	if summary.Hits != 2 || summary.Warnings != 1 || summary.Cancelled {
		t.Fatalf("summary = %+v", summary)
	}
	if len(events.events) != 3 || events.events[0].name != "search:hit" {
		t.Fatalf("events = %+v", events.events)
	}
	if searcher.req.Query != "match" || searcher.req.Root != "/r" {
		t.Fatalf("request = %+v", searcher.req)
	}
	if searcher.progress != progress {
		t.Fatal("progress port must be forwarded to the interactor")
	}
	// the event payload must be the editor-owned hit, not the engine's
	if h, ok := events.events[0].data.(domain.SearchHit); !ok || h.Entry != "x.set" || h.Line != 1 {
		t.Fatalf("hit payload = %T %+v", events.events[0].data, events.events[0].data)
	}
}

func TestSearchAllSwallowsCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // caller cancelled mid-run
	searcher := &fakeSearcher{
		hits:   []usecase.SearchHit{{Archive: "A.res", Text: "m"}},
		retErr: errors.New("search_all: context canceled"),
	}
	svc := NewSearchService(searcher, &fakeProgress{}, &fakeEmitter{})

	summary, err := svc.SearchAll(ctx, domain.SearchRequest{Query: "m"})
	if err != nil {
		t.Fatalf("cancellation must not surface as an error, got %v", err)
	}
	if !summary.Cancelled || summary.Hits != 1 {
		t.Fatalf("summary = %+v", summary)
	}
}

func TestSearchAllPropagatesRealErrors(t *testing.T) {
	want := errors.New("bad archive")
	svc := NewSearchService(&fakeSearcher{retErr: want}, &fakeProgress{}, &fakeEmitter{})
	if _, err := svc.SearchAll(context.Background(), domain.SearchRequest{Query: "x"}); !errors.Is(err, want) {
		t.Fatalf("err = %v, want %v", err, want)
	}
}

func TestSearchAllConcurrentEmitIsRaceFree(t *testing.T) {
	search := searcherFunc(func(ctx context.Context, req usecase.SearchRequest, emit func(usecase.SearchHit), progress usecase.ProgressPort) error {
		var wg sync.WaitGroup
		for i := 0; i < 8; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for j := 0; j < 50; j++ {
					emit(usecase.SearchHit{Archive: "A.res", Text: "m"})
				}
			}()
		}
		wg.Wait()
		return nil
	})
	svc := NewSearchService(search, &fakeProgress{}, &fakeEmitter{})

	summary, err := svc.SearchAll(context.Background(), domain.SearchRequest{Query: "m"})
	if err != nil {
		t.Fatal(err)
	}
	if summary.Hits != 400 {
		t.Fatalf("hits = %d, want 400 (run with -race)", summary.Hits)
	}
}
