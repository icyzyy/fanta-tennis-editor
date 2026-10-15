package controller

import (
	"context"
	"errors"
	"testing"

	"github.com/icyzyy/fanta-tennis-res-kit/domain"
	"github.com/icyzyy/fanta-tennis-res-kit/usecase"
)

type fakeOpener struct {
	root  string
	ws    *usecase.Workspace
	err   error
	calls int
}

func (f *fakeOpener) Do(ctx context.Context, root string) (*usecase.Workspace, error) {
	f.calls++
	f.root = root
	return f.ws, f.err
}

type fakeLister struct {
	entries []usecase.EntryInfo
	err     error
	archive string
}

func (f *fakeLister) Do(ctx context.Context, archive string) ([]usecase.EntryInfo, error) {
	f.archive = archive
	return f.entries, f.err
}

func TestOpenWorkspacePassesRootThrough(t *testing.T) {
	opener := &fakeOpener{ws: &usecase.Workspace{
		Root:     "/r",
		Archives: []usecase.ArchiveInfo{{Path: "/r/A.res", Size: 10, ModTime: 1}},
	}}
	svc := NewWorkspaceService(opener, &fakeLister{})

	got, err := svc.OpenWorkspace(context.Background(), "/r")
	if err != nil {
		t.Fatal(err)
	}
	if opener.root != "/r" || opener.calls != 1 {
		t.Fatalf("opener = %+v", opener)
	}
	if got.Root != "/r" || len(got.Archives) != 1 {
		t.Fatalf("workspace = %+v", got)
	}
}

func TestOpenWorkspacePropagatesError(t *testing.T) {
	want := errors.New("bad root")
	svc := NewWorkspaceService(&fakeOpener{err: want}, &fakeLister{})
	if _, err := svc.OpenWorkspace(context.Background(), "/x"); !errors.Is(err, want) {
		t.Fatalf("err = %v, want %v", err, want)
	}
}

func TestListEntriesReturnsWireViews(t *testing.T) {
	lister := &fakeLister{entries: []usecase.EntryInfo{
		{Name: "A.set", Kind: domain.KindSet, ModTime: 5},
		{Name: "B.tex", Kind: domain.KindTex, ModTime: 6},
		{Name: "C.bin", Kind: domain.KindOther, ModTime: 7},
	}}
	svc := NewWorkspaceService(&fakeOpener{}, lister)

	got, err := svc.ListEntries(context.Background(), "Gui3.res")
	if err != nil {
		t.Fatal(err)
	}
	if lister.archive != "Gui3.res" {
		t.Fatalf("archive = %q", lister.archive)
	}
	wantKinds := []string{"set", "tex", "other"}
	if len(got) != len(wantKinds) {
		t.Fatalf("got %d entries, want %d", len(got), len(wantKinds))
	}
	for i, e := range got {
		if e.Kind != wantKinds[i] {
			t.Fatalf("entry %d kind = %q, want %q", i, e.Kind, wantKinds[i])
		}
	}
	if got[0].Name != "A.set" || got[0].ModTime != 5 {
		t.Fatalf("entry = %+v", got[0])
	}
}

func TestListEntriesPropagatesError(t *testing.T) {
	want := errors.New("no such archive")
	svc := NewWorkspaceService(&fakeOpener{}, &fakeLister{err: want})
	if _, err := svc.ListEntries(context.Background(), "X.res"); !errors.Is(err, want) {
		t.Fatalf("err = %v", err)
	}
}

type panicOpener struct{}

func (panicOpener) Do(context.Context, string) (*usecase.Workspace, error) {
	panic("boom")
}

// Spec §5: panics are recovered only at driver boundaries.
func TestOpenWorkspaceRecoversPanicAsDriverError(t *testing.T) {
	svc := NewWorkspaceService(panicOpener{}, nil)
	ws, err := svc.OpenWorkspace(context.Background(), "/x")
	if ws != nil {
		t.Fatalf("workspace = %v, want nil", ws)
	}
	if err == nil || err.Error() != "open_workspace: panic: boom" {
		t.Fatalf("err = %v, want open_workspace: panic: boom", err)
	}
}
