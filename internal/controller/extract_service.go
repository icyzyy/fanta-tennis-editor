package controller

import (
	"context"

	"fanta-tennis-editor/internal/domain"
	"github.com/icyzyy/fanta-tennis-res-kit/usecase"
)

// Ports consumed by ExtractService.
type entryExtractor interface {
	Do(ctx context.Context, req usecase.ExtractRequest, progress usecase.ProgressPort) (*usecase.ExtractResult, error)
}

// ExtractService binds export-to-folder. Progress flows through the shared
// bridge (op "extract" → extract:progress).
type ExtractService struct {
	extract  entryExtractor
	progress usecase.ProgressPort
}

// NewExtractService wires the interactor port and the shared progress port.
func NewExtractService(extract entryExtractor, progress usecase.ProgressPort) *ExtractService {
	return &ExtractService{extract: extract, progress: progress}
}

// Extract writes the requested entries (or the whole archive when Entries is
// empty) to req.Dest and returns the files written.
func (s *ExtractService) Extract(ctx context.Context, req domain.ExtractRequest) (out *domain.ExtractResult, err error) {
	defer recoverAs("extract", &err)
	res, err := s.extract.Do(ctx, extractRequestOf(req), s.progress)
	if err != nil {
		return nil, err
	}
	return extractResultOf(res), nil
}
