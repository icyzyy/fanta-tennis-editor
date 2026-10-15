package controller

import (
	"context"
	"sync"

	"fanta-tennis-editor/internal/domain"
	"fanta-tennis-editor/internal/presenter"
	"github.com/icyzyy/fanta-tennis-res-kit/usecase"
)

// Ports consumed by SearchService.
type entrySearcher interface {
	Do(ctx context.Context, req usecase.SearchRequest, emit func(usecase.SearchHit), progress usecase.ProgressPort) error
}

// SearchService binds the cancellable global search. Hits stream on
// search:hit while Do runs; the bound result carries only the summary.
type SearchService struct {
	search   entrySearcher
	progress usecase.ProgressPort
	events   eventEmitter
}

// NewSearchService wires the interactor port, the shared progress port
// (bridge → search:progress) and the event emitter (bridge → search:hit).
func NewSearchService(search entrySearcher, progress usecase.ProgressPort, events eventEmitter) *SearchService {
	return &SearchService{search: search, progress: progress, events: events}
}

// SearchAll streams hits as search:hit events and returns a summary.
// Cancellation is not an error: the JS promise already rejected with
// CancelError, so a late Go error would surface as CancelledRejectionError
// console noise — swallow it and flag the summary instead.
func (s *SearchService) SearchAll(ctx context.Context, req domain.SearchRequest) (out *presenter.SearchSummary, err error) {
	defer recoverAs("search_all", &err)
	summary := &presenter.SearchSummary{}
	var mu sync.Mutex // reskit emits from per-archive worker goroutines
	err = s.search.Do(ctx, searchRequestOf(req), func(h usecase.SearchHit) {
		mu.Lock()
		if h.Warning != "" {
			summary.Warnings++
		} else {
			summary.Hits++
		}
		mu.Unlock()
		s.events.Emit("search:hit", searchHitOf(h))
	}, s.progress)
	if err != nil {
		if ctx.Err() != nil { // caller cancelled mid-run
			summary.Cancelled = true
			return summary, nil
		}
		return nil, err
	}
	return summary, nil
}
