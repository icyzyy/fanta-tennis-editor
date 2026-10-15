package bridge

import (
	"testing"

	"github.com/icyzyy/fanta-tennis-res-kit/usecase"

	"fanta-tennis-editor/internal/presenter"
)

type recEvent struct {
	name string
	data any
}

type recorder struct{ events []recEvent }

func (r *recorder) Emit(name string, data any) {
	r.events = append(r.events, recEvent{name: name, data: data})
}

func TestReportMapsKnownOpsToRegisteredEvents(t *testing.T) {
	cases := map[string]string{
		"open_workspace": "workspace:discovered",
		"search":         "search:progress",
		"extract":        "extract:progress",
	}
	for op, want := range cases {
		rec := &recorder{}
		b := New()
		b.Connect(rec)
		b.Report(usecase.ProgressEvent{Op: op, Done: 2, Total: 5, Path: "Gui3.res"})
		if len(rec.events) != 1 {
			t.Fatalf("op %q: got %d events, want 1", op, len(rec.events))
		}
		if rec.events[0].name != want {
			t.Fatalf("op %q: event name %q, want %q", op, rec.events[0].name, want)
		}
		notice, ok := rec.events[0].data.(presenter.ProgressNotice)
		if !ok {
			t.Fatalf("op %q: payload type %T, want presenter.ProgressNotice", op, rec.events[0].data)
		}
		if notice.Op != op || notice.Done != 2 || notice.Total != 5 || notice.Path != "Gui3.res" {
			t.Fatalf("notice = %+v", notice)
		}
	}
}

func TestReportDropsUnknownOp(t *testing.T) {
	rec := &recorder{}
	b := New()
	b.Connect(rec)
	b.Report(usecase.ProgressEvent{Op: "mystery", Done: 1, Total: 1})
	if len(rec.events) != 0 {
		t.Fatalf("unknown op must be dropped, got %+v", rec.events)
	}
}

func TestDisconnectedBusIsNoop(t *testing.T) {
	b := New()
	b.Report(usecase.ProgressEvent{Op: "search"}) // must not panic
	b.Emit("search:hit", nil)                     // must not panic
}

func TestEmitPassesThroughAfterConnect(t *testing.T) {
	rec := &recorder{}
	b := New()
	b.Connect(rec)
	payload := presenter.EntrySaved{Archive: "A.res", Entry: "B.set", Revision: 7}
	b.Emit("entry:saved", payload)
	if len(rec.events) != 1 || rec.events[0].name != "entry:saved" {
		t.Fatalf("events = %+v", rec.events)
	}
	if got, ok := rec.events[0].data.(presenter.EntrySaved); !ok || got.Revision != 7 {
		t.Fatalf("payload = %#v", rec.events[0].data)
	}
}

func TestReportPropagatesErrField(t *testing.T) {
	rec := &recorder{}
	b := New()
	b.Connect(rec)
	b.Report(usecase.ProgressEvent{Op: "extract", Done: 1, Total: 3, Path: "x.bin", Err: "permission denied"})
	notice := rec.events[0].data.(presenter.ProgressNotice)
	if notice.Err != "permission denied" {
		t.Fatalf("notice = %+v", notice)
	}
}
