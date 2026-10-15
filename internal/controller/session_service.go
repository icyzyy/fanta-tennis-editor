package controller

import (
	"context"
	"sync/atomic"
)

// backupSetter is satisfied by *reszip.Repo (usecase.ArchiveRepo.SetBackup).
type backupSetter interface {
	SetBackup(enabled bool)
}

// CloseGuard carries the window-close decision state between the frontend
// (which pushes the dirty-buffer count through SessionService) and main's
// WindowClosing hook. Not a bound service — main reads it directly.
type CloseGuard struct {
	dirty  atomic.Int64
	force  atomic.Bool
	asking atomic.Bool
}

// SetDirty records how many buffers currently have unsaved changes.
func (g *CloseGuard) SetDirty(n int) { g.dirty.Store(int64(n)) }

// Dirty returns the current unsaved-buffer count.
func (g *CloseGuard) Dirty() int { return int(g.dirty.Load()) }

// Forced reports whether the user already confirmed quitting.
func (g *CloseGuard) Forced() bool { return g.force.Load() }

// Force lets the next close attempt through.
func (g *CloseGuard) Force() { g.force.Store(true) }

// BeginAsk wins only when no quit dialog is open (at most one dialog).
func (g *CloseGuard) BeginAsk() bool { return g.asking.CompareAndSwap(false, true) }

// EndAsk re-arms the dialog after it closes.
func (g *CloseGuard) EndAsk() { g.asking.Store(false) }

// SessionService binds the app-session settings the frontend pushes:
// the dirty-buffer count (unsaved-exit guard) and the backup toggle.
type SessionService struct {
	guard  *CloseGuard
	backup backupSetter
}

// NewSessionService wires the shared guard and the repo's backup switch.
func NewSessionService(guard *CloseGuard, backup backupSetter) *SessionService {
	return &SessionService{guard: guard, backup: backup}
}

// SetDirtyCount pushes the number of dirty buffers so the WindowClosing hook
// can warn before quitting. (Returns error → $CancellablePromise<void>.)
func (s *SessionService) SetDirtyCount(_ context.Context, count int) (err error) {
	defer recoverAs("set_dirty_count", &err)
	s.guard.SetDirty(count)
	return nil
}

// SetBackup toggles the <archive>.bak copy made before the first write of a
// session (reskit default: on; the settings store re-applies its persisted
// value at startup).
func (s *SessionService) SetBackup(_ context.Context, enabled bool) (err error) {
	defer recoverAs("set_backup", &err)
	s.backup.SetBackup(enabled)
	return nil
}
