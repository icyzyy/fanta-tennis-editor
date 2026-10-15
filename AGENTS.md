# fanta-tennis-editor — agent instructions

Wails 3 desktop app (React + TS + Tailwind) for browsing, viewing, editing,
searching, and extracting the FantaTennis client `Res/*.res` archives.
All archive logic lives in the sibling `../reskit` module (frozen API, Plan 1);
this repo owns only the driver layer (presenter / bridge / controller / main)
and the frontend.

## Commands
- `make frontend` — pnpm install + build → `frontend/dist` (required by embed)
- `make test` — frontend build + vitest + `CGO_ENABLED=1 go test ./...`
- `make vet` / `make fmt` — must be clean
- `make build` — frontend + `CGO_ENABLED=1 go build .`
- `make bindings` — `CGO_ENABLED=1 wails3 generate bindings` (re-run after any
  bound-method change; the output under `frontend/bindings/` is committed)
- `make full` — `PACKAGE_MANAGER=pnpm wails3 build` (production binary → bin/)
- `make dev` — `PACKAGE_MANAGER=pnpm wails3 dev`
- `make integration` — needs `FANTA_RES_DIR` (see below)

## Hard rules
- **CGO:** the host defaults to `CGO_ENABLED=0`; every bare go command needs
  `CGO_ENABLED=1`. Build the root package only (`go build .`, never
  `go build ./...` — `build/ios` has no main).
- **Never run or build iOS/Android** (`build/ios`, `build/android` are scaffold
  leftovers; ignore them entirely).
- **pnpm only** (npm breaks on `@wailsio/runtime`'s `workspace:*`); Wails tasks
  need `PACKAGE_MANAGER=pnpm`.
- **Read-only corpora:** any external Res corpus (the shared clean copy) and
  `client/Res` may be *read* only —
  never written, renamed, or deleted. Only the `FANTA_RES_DIR`-gated
  integration test reads them; its extraction targets `t.TempDir()`.
- jsdom must stay at major 26 (v30 breaks Node 20).

## Architecture (driver layer; reskit = domain → usecase → adapter)
- `internal/presenter/` — boundary types → JSON view models (string kinds,
  normalised texture); `MarshalError` → `{code,message,detail}` JSON.
- `internal/bridge/` — `Bus` implements `usecase.ProgressPort`, maps progress
  ops to the registered event names; `Emitter` interface injected from main
  (no globals, no wails imports in tests).
- `internal/controller/` — bound Wails services, thin: ctx-first methods,
  consumer-declared ports, results through presenter. Never imports wails,
  adapters, or bridge.
- `main.go` — composition root: the only file naming concrete adapters
  (`reszip.New`, `aesecb.New`, `texdecoder.New`, `disk.New`), interactors,
  services, events, the window, and the close-guard hook.
- `src/api/` — sole importer of `frontend/bindings/`; normalises
  `RuntimeError.cause` → `AppError {code, message, detail}`.
- `src/state/` — zustand stores (workspace, buffers, search, settings, toast).
- `src/panels/` — React components (tree, buffers, editors, search, dialogs).

## Event catalog (registered in `main.go` init())
`workspace:discovered`, `search:progress`, `extract:progress` → `ProgressNotice`;
`search:hit` → `SearchHit`; `entry:saved` → `EntrySaved`.

## Tests
- Go: `*_test.go` beside sources — table-driven, fakes; controller/presenter/
  bridge tests never import wails.
- Frontend: vitest + jsdom@26 + Testing Library; generated bindings mocked
  with `vi.mock`.
- Integration (opt-in):
  `FANTA_RES_DIR=/path/to/client/Res make integration`
  — read-only; extraction targets `t.TempDir()`.
