# fanta-tennis-editor

[![Go Version](https://img.shields.io/badge/go-1.27%2B-blue.svg)](https://golang.org)
[![Wails: v3](https://img.shields.io/badge/wails-v3-bc4749.svg)](https://wails.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S4V328HBWR)

`fanta-tennis-editor` is a desktop GUI editor for the FantaTennis game client's `Res/*.res` archives. Point it at your `Res` folder and browse everything the game ships — ~630 archives, ~5,400 textures, ~880 data tables — edit `.set` game data in a real XML editor, preview textures and swap them from PNGs, and extract anything you need. Every write is guarded by backups, atomic replacement, and validation, so you can mod your client without gambling with a corrupted install. A second mode patches the game's `FantaTennis.exe` directly, with the same draft-then-apply care.

All of the format knowledge — archive handling, `.set` cryptography, texture decode/encode — lives in [`fanta-tennis-res-kit`](https://github.com/icyzyy/fanta-tennis-res-kit); exe patching is powered by the pinned [`fanta-tennis-exe-patcher`](https://github.com/icyzyy/fanta-tennis-exe-patcher) kit; this app is the UI on top of both.

---

## Features

- **Browse & Search**: a tree over your entire `Res` folder — every archive, every entry — with full-text search across all of them at once.
- **`.set` Game Data Editing**: open a `.set` entry to decrypt it to XML, edit it in the built-in editor, and save it back — strictly validated, re-encrypted, and repacked. Only `.set` files are editable; everything else is preview-only, by design.
- **Texture Viewing**: `.tex`, `.dds`, `.tga`, and `.bmp` entries render as previews with a fit / actual-size toggle and a one-click **Export PNG**.
- **Texture Import**: replace a texture from a PNG via the entry's context menu — dimensions must match, the image is re-encoded to the original format (DXT1/3/5 or RGB) with a full mip chain generated.
- **Extraction**: save a single entry or a whole archive to disk, with optional automatic `.set` decryption.
- **Hex View**: formats the app doesn't interpret (`.ftm`, `.prj`, `.dat`, …) open as a read-only hex/binary view.
- **Picker-first Launch**: the app opens on a picker — choose a `Res` folder or the game exe — and a **Back to picker** button returns you there anytime, still prompting to save dirty buffers before switching.
- **Exe Patching**: open `FantaTennis.exe` and toggle its client-side settings. Values are read live from your current build (settings that don't match your build explain why), each edit is drafted in the UI, then applied atomically with the resulting MD5 shown. The custom-DLL loader ships as a checkbox plus an editable DLL name decoded from your exe.

## Safe by design

The editor is built so a mistake can't brick your client:

- **Browsing, searching, previewing, and extracting never modify your archives** — only an explicit save or texture import writes anything.
- The **first write** to each archive creates `<archive>.bak` beside it.
- Every replacement is **atomic**: temp file in the same directory → fsync → verify → rename over the original. On any failure, the original file is left untouched.
- `.set` saves are **strictly validated** — malformed XML is rejected before it can ever reach the game client.
- Backups are on by default and can be toggled in **Settings**.

## Build from Source

### Requirements

- Go 1.27 or newer
- Node.js with [pnpm](https://pnpm.io) (`npm install -g pnpm`)
- Wails 3 CLI: `go install github.com/wailsapp/wails/v3/cmd/wails3@latest`

### Build

```bash
git clone https://github.com/icyzyy/fanta-tennis-editor.git
cd fanta-tennis-editor
PACKAGE_MANAGER=pnpm wails3 build
```

The binary lands in `bin/` (`fanta-tennis-editor` on Linux, `fanta-tennis-editor.exe` on Windows). To cross-compile the Windows build from Linux:

```bash
CGO_ENABLED=0 PACKAGE_MANAGER=pnpm wails3 build GOOS=windows
```

The build also regenerates the typed TypeScript bindings from the Go backend automatically.

## Development

```bash
wails3 dev                      # dev mode with hot reload (frontend + backend)
```

Testing:

```bash
go test ./...                   # backend unit tests
cd frontend && pnpm test        # frontend unit tests (Vitest)
```

Integration tests run against a real archive corpus and are **read-only** — they're skipped unless `FANTA_RES_DIR` points at a copy of the game's `Res` folder:

```bash
FANTA_RES_DIR=/path/to/Res CGO_ENABLED=1 go test -count=1 -tags=integration -run TestIntegration .
```

Stack: Go backend on [Wails v3](https://wails.io); React + TypeScript frontend built with Vite and pnpm; typed TS bindings generated from the Go controllers.

## Support

If you find this project helpful and want to support its maintenance and further development:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S4V328HBWR)

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
