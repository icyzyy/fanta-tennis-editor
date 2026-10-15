// Package controller holds the bound Wails services. They stay thin: ctx-first
// methods, consumer-owned ports, results through presenter. No wails imports —
// main registers them.
package controller

import (
	"context"

	"fanta-tennis-editor/internal/domain"
	"fanta-tennis-editor/internal/presenter"
	"github.com/icyzyy/fanta-tennis-res-kit/usecase"
)

// Ports consumed by WorkspaceService. Satisfied by the reskit interactors
// (wired in main) or by fakes in tests.
type workspaceOpener interface {
	Do(ctx context.Context, root string) (*usecase.Workspace, error)
}

type entryLister interface {
	Do(ctx context.Context, archive string) ([]usecase.EntryInfo, error)
}

// WorkspaceService binds workspace browsing: discover archives under a root,
// list an archive's entries. Discovery progress flows from the interactor's
// progress port (bridge → workspace:discovered), wired in main.
type WorkspaceService struct {
	open   workspaceOpener
	lister entryLister
}

// NewWorkspaceService wires the interactor ports.
func NewWorkspaceService(open workspaceOpener, lister entryLister) *WorkspaceService {
	return &WorkspaceService{open: open, lister: lister}
}

// OpenWorkspace discovers **/*.res under root and returns the workspace.
func (s *WorkspaceService) OpenWorkspace(ctx context.Context, root string) (out *domain.Workspace, err error) {
	defer recoverAs("open_workspace", &err)
	w, err := s.open.Do(ctx, root)
	if err != nil {
		return nil, err
	}
	return workspaceOf(w), nil
}

// ListEntries returns an archive's entries as wire views (kind as string).
func (s *WorkspaceService) ListEntries(ctx context.Context, archive string) (out []presenter.Entry, err error) {
	defer recoverAs("list_entries", &err)
	entries, err := s.lister.Do(ctx, archive)
	if err != nil {
		return nil, err
	}
	return presenter.EntriesOf(entries), nil
}
