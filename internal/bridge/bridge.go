// Package bridge connects reskit progress reporting and controller event
// emission to the frontend. It knows nothing about Wails: the composition
// root injects the concrete emitter, tests inject a recorder.
package bridge

import (
	"sync"

	"fanta-tennis-editor/internal/presenter"
	"github.com/icyzyy/fanta-tennis-res-kit/usecase"
)

// Emitter ships a named event with a JSON-marshalable payload to the
// frontend. Declared here so presenter/usecase stay Wails-free.
type Emitter interface {
	Emit(name string, data any)
}

// progressEvents maps reskit progress ops to the event names registered in
// main's init().
var progressEvents = map[string]string{
	"open_workspace": "workspace:discovered",
	"search":         "search:progress",
	"extract":        "extract:progress",
}

// Bus is the progress/event conduit between reskit interactors, the
// controllers and the frontend. Safe for concurrent use: search workers and
// extract loops report from goroutines.
type Bus struct {
	mu   sync.Mutex
	emit Emitter
}

// New returns a disconnected Bus — Report and Emit are no-ops until Connect.
func New() *Bus { return &Bus{} }

// Connect installs the emitter. Called once from the composition root right
// after the application is constructed; bound calls only run after
// app.Run(), so no event can be missed.
func (b *Bus) Connect(e Emitter) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.emit = e
}

// Emit implements the controllers' Emitter ports.
func (b *Bus) Emit(name string, data any) {
	b.mu.Lock()
	e := b.emit
	b.mu.Unlock()
	if e == nil {
		return
	}
	e.Emit(name, data)
}

// Report implements usecase.ProgressPort: forwards the event under the name
// registered for its op. Unknown ops are dropped (forward compatibility).
func (b *Bus) Report(ev usecase.ProgressEvent) {
	name, ok := progressEvents[ev.Op]
	if !ok {
		return
	}
	b.Emit(name, presenter.ProgressNotice{
		Op:    ev.Op,
		Done:  ev.Done,
		Total: ev.Total,
		Path:  ev.Path,
		Err:   ev.Err,
	})
}
