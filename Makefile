.PHONY: dist frontend test vet fmt build bindings dev full integration

F := pnpm --dir frontend

frontend:
	$(F) install
	$(F) build

dist: frontend

test: dist
	$(F) test
	CGO_ENABLED=1 go test ./...

vet: dist
	CGO_ENABLED=1 go vet ./...

fmt:
	@test -z "$$(gofmt -l .)" || (gofmt -l . && exit 1)

build: dist
	CGO_ENABLED=1 go build .

bindings:
	CGO_ENABLED=1 wails3 generate bindings -ts -i

dev:
	PACKAGE_MANAGER=pnpm wails3 dev

full:
	PACKAGE_MANAGER=pnpm wails3 build

integration: dist
	CGO_ENABLED=1 go test -tags=integration -run TestIntegration ./...
