package main

import (
	"embed"
	"fmt"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"

	"fanta-tennis-editor/internal/bridge"
	"fanta-tennis-editor/internal/controller"
	"fanta-tennis-editor/internal/domain"
	"fanta-tennis-editor/internal/presenter"
	"github.com/icyzyy/fanta-tennis-res-kit/adapter/aesecb"
	"github.com/icyzyy/fanta-tennis-res-kit/adapter/disk"
	"github.com/icyzyy/fanta-tennis-res-kit/adapter/imgdecoder"
	"github.com/icyzyy/fanta-tennis-res-kit/adapter/reszip"
	"github.com/icyzyy/fanta-tennis-res-kit/adapter/texdecoder"
	"github.com/icyzyy/fanta-tennis-res-kit/usecase"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

// init registers the custom events; the binding generator picks them up for
// the typed JS API. Emit data must match these types exactly.
func init() {
	application.RegisterEvent[presenter.ProgressNotice]("workspace:discovered")
	application.RegisterEvent[presenter.ProgressNotice]("search:progress")
	application.RegisterEvent[presenter.ProgressNotice]("extract:progress")
	application.RegisterEvent[domain.SearchHit]("search:hit")
	application.RegisterEvent[presenter.EntrySaved]("entry:saved")
}

// wailsEmitter adapts the Wails event bus to bridge.Emitter.
type wailsEmitter struct{ em *application.EventManager }

func (w wailsEmitter) Emit(name string, data any) { w.em.Emit(name, data) }

// appGraph bundles the bound services (also used by the integration test).
type appGraph struct {
	workspace *controller.WorkspaceService
	entry     *controller.EntryService
	search    *controller.SearchService
	extract   *controller.ExtractService
	session   *controller.SessionService
	guard     *controller.CloseGuard
	exePatch  *controller.ExePatchService
}

// buildGraph is the composition root — the only place naming concrete
// adapters and interactors. One shared reszip repo carries the backup switch
// and per-archive locking across every operation. The bus is connected to
// the Wails event bus right after application.New(); bound calls only run
// after app.Run(), so no event can be missed.
func buildGraph(bus *bridge.Bus) *appGraph {
	repo := reszip.New() // .bak before first write per archive (default on)
	cipher := aesecb.New()
	tex := texdecoder.New()
	fs := disk.New()

	open := usecase.NewOpenWorkspace(fs, bus) // progress → workspace:discovered
	list := usecase.NewListEntries(repo)
	read := usecase.NewReadEntry(repo, cipher, tex)
	save := usecase.NewSaveEntry(repo, cipher)
	search := usecase.NewSearchAll(repo, cipher, fs)
	extract := usecase.NewExtract(repo, cipher, fs)
	preview := usecase.NewPreviewImage(repo, imgdecoder.New())

	guard := &controller.CloseGuard{}
	return &appGraph{
		workspace: controller.NewWorkspaceService(open, list),
		entry:     controller.NewEntryService(read, save, preview, repo, bus),
		search:    controller.NewSearchService(search, bus, bus),
		extract:   controller.NewExtractService(extract, bus),
		session:   controller.NewSessionService(guard, repo),
		guard:     guard,
		exePatch:  controller.NewExePatchService(),
	}
}

func main() {
	bus := bridge.New()
	graph := buildGraph(bus)

	app := application.New(application.Options{
		Name:        "fanta-tennis-editor",
		Description: "GRF-Editor-style browser/editor for the FantaTennis client Res archives",
		Icon:        appIcon,
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Services: []application.Service{
			application.NewServiceWithOptions(graph.workspace,
				application.ServiceOptions{MarshalError: presenter.MarshalError}),
			application.NewServiceWithOptions(graph.entry,
				application.ServiceOptions{MarshalError: presenter.MarshalError}),
			application.NewServiceWithOptions(graph.search,
				application.ServiceOptions{MarshalError: presenter.MarshalError}),
			application.NewServiceWithOptions(graph.extract,
				application.ServiceOptions{MarshalError: presenter.MarshalError}),
			application.NewServiceWithOptions(graph.session,
				application.ServiceOptions{MarshalError: presenter.MarshalError}),
			application.NewServiceWithOptions(graph.exePatch,
				application.ServiceOptions{MarshalError: presenter.MarshalError}),
		},
	})
	bus.Connect(wailsEmitter{em: app.Event})

	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "FantaTennis Editor",
		Width:            1280,
		Height:           840,
		BackgroundColour: application.NewRGB(10, 10, 10),
		URL:              "/",
	})

	// Unsaved-exit guard (spec §4): hold the close while buffers are dirty
	// and ask natively; "Discard and quit" forces the next attempt through.
	window.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		g := graph.guard
		if g.Forced() || g.Dirty() == 0 {
			return // confirmed quit, or nothing to lose
		}
		e.Cancel() // keep the window open until the user decides
		if !g.BeginAsk() {
			return // a quit dialog is already open
		}
		go func() {
			d := app.Dialog.Question().
				SetTitle("Unsaved changes").
				SetMessage(fmt.Sprintf("%d buffer(s) have unsaved changes. Discard and quit?", g.Dirty()))
			d.AddButton("Keep editing").SetAsCancel().SetAsDefault().OnClick(func() {
				g.EndAsk()
			})
			d.AddButton("Discard and quit").OnClick(func() {
				g.EndAsk()
				g.Force()
				window.Close()
			})
			d.Show()
		}()
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
