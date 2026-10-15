package controller

import (
	"context"
	"testing"
)

type fakeBackup struct {
	enabled bool
	calls   int
}

func (f *fakeBackup) SetBackup(enabled bool) {
	f.enabled = enabled
	f.calls++
}

func TestSetDirtyCountDrivesGuard(t *testing.T) {
	guard := &CloseGuard{}
	svc := NewSessionService(guard, &fakeBackup{})

	if err := svc.SetDirtyCount(context.Background(), 3); err != nil {
		t.Fatal(err)
	}
	if guard.Dirty() != 3 {
		t.Fatalf("dirty = %d, want 3", guard.Dirty())
	}
	if err := svc.SetDirtyCount(context.Background(), 0); err != nil {
		t.Fatal(err)
	}
	if guard.Dirty() != 0 {
		t.Fatalf("dirty = %d, want 0", guard.Dirty())
	}
}

func TestSetBackupForwarded(t *testing.T) {
	backup := &fakeBackup{}
	svc := NewSessionService(&CloseGuard{}, backup)

	if err := svc.SetBackup(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	if backup.calls != 1 || backup.enabled {
		t.Fatalf("backup = %+v", backup)
	}
}

func TestCloseGuardAskOnceSemantics(t *testing.T) {
	g := &CloseGuard{}
	if !g.BeginAsk() {
		t.Fatal("first BeginAsk must win")
	}
	if g.BeginAsk() {
		t.Fatal("second BeginAsk must lose while a dialog is open")
	}
	g.EndAsk()
	if !g.BeginAsk() {
		t.Fatal("BeginAsk must work after EndAsk")
	}
	g.EndAsk()
}

func TestCloseGuardForceAndDirtyDefaults(t *testing.T) {
	g := &CloseGuard{}
	if g.Dirty() != 0 || g.Forced() {
		t.Fatalf("defaults: dirty=%d forced=%v", g.Dirty(), g.Forced())
	}
	g.Force()
	if !g.Forced() {
		t.Fatal("Force must stick")
	}
}

type panicBackup struct{}

func (panicBackup) SetBackup(bool) { panic("boom") }

// Spec §5: a panic inside a bound port surfaces as an error at the boundary.
func TestSetBackupRecoversPanicAsError(t *testing.T) {
	svc := NewSessionService(&CloseGuard{}, panicBackup{})
	if err := svc.SetBackup(context.Background(), true); err == nil || err.Error() != "set_backup: panic: boom" {
		t.Fatalf("err = %v, want set_backup: panic: boom", err)
	}
}
