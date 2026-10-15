package controller

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"

	"github.com/icyzyy/fanta-tennis-exe-patcher/exepatch"
)

// fakeExeBackend records every call in order as
// "readSettings:<path>" / "apply:<path>:<id>:<value>" / "rename:<path>:<name>"
// so tests can assert both sequencing (apply before the fresh read) and
// pass-through arguments.
type fakeExeBackend struct {
	settings  []resolvedSetting
	readErr   error
	applyMD5  string
	applyErr  error
	renameMD5 string
	renameErr error
	calls     []string
}

func (f *fakeExeBackend) readSettings(path string) ([]resolvedSetting, error) {
	f.calls = append(f.calls, "readSettings:"+path)
	if f.readErr != nil {
		return nil, f.readErr
	}
	return f.settings, nil
}

func (f *fakeExeBackend) apply(path, id, value string) (string, error) {
	f.calls = append(f.calls, fmt.Sprintf("apply:%s:%s:%s", path, id, value))
	if f.applyErr != nil {
		return "", f.applyErr
	}
	return f.applyMD5, nil
}

func (f *fakeExeBackend) rename(path, name string) (string, error) {
	f.calls = append(f.calls, fmt.Sprintf("rename:%s:%s", path, name))
	if f.renameErr != nil {
		return "", f.renameErr
	}
	return f.renameMD5, nil
}

func TestOpenExeReturnsSettingsAndRemembersPath(t *testing.T) {
	backend := &fakeExeBackend{settings: []resolvedSetting{{s: exepatch.Setting{
		ID: "refillUrl", Label: "Cookie refill URL", Value: "https://a", Editable: true, MaxLength: 199,
	}}}}
	svc := newExePatchService(backend)

	got, err := svc.OpenExe(context.Background(), "/game/FantaTennis.exe")
	if err != nil {
		t.Fatal(err)
	}
	if got.Path != "/game/FantaTennis.exe" {
		t.Fatalf("path = %q", got.Path)
	}
	if got.MD5 != "" {
		t.Fatalf("md5 = %q, want empty after open", got.MD5)
	}
	if len(got.Settings) != 1 || got.Settings[0].ID != "refillUrl" ||
		got.Settings[0].Value != "https://a" || got.Settings[0].MaxLength != 199 {
		t.Fatalf("settings = %+v", got.Settings)
	}

	// The remembered path is what a later apply targets.
	backend.settings = []resolvedSetting{{s: exepatch.Setting{
		ID: "refillUrl", Label: "Cookie refill URL", Value: "https://b", Editable: true, MaxLength: 199,
	}}}
	if _, err := svc.ApplyExeSetting(context.Background(), "refillUrl", "https://b", ""); err != nil {
		t.Fatal(err)
	}
	want := []string{
		"readSettings:/game/FantaTennis.exe",
		"apply:/game/FantaTennis.exe:refillUrl:https://b",
		"readSettings:/game/FantaTennis.exe",
	}
	if !reflect.DeepEqual(backend.calls, want) {
		t.Fatalf("calls = %v, want %v", backend.calls, want)
	}
}

func TestOpenExeBackendFailurePropagates(t *testing.T) {
	backend := &fakeExeBackend{settings: []resolvedSetting{{s: exepatch.Setting{
		ID: "dllLoad", Label: "dll load", Value: "on", Editable: true,
	}}}}
	svc := newExePatchService(backend)
	if _, err := svc.OpenExe(context.Background(), "/game/a.exe"); err != nil {
		t.Fatal(err)
	}

	want := errors.New("not a PE32 image")
	backend.readErr = want
	got, err := svc.OpenExe(context.Background(), "/game/b.exe")
	if !errors.Is(err, want) {
		t.Fatalf("err = %v, want %v", err, want)
	}
	if got != nil {
		t.Fatalf("state = %+v, want nil", got)
	}

	// The failed open must not clobber the previously remembered path.
	backend.readErr = nil
	if _, err := svc.ApplyExeSetting(context.Background(), "dllLoad", "off", ""); err != nil {
		t.Fatal(err)
	}
	if backend.calls[len(backend.calls)-2] != "apply:/game/a.exe:dllLoad:off" {
		t.Fatalf("calls = %v, want apply on /game/a.exe", backend.calls)
	}
}

func TestApplyWithNoOpenExeErrors(t *testing.T) {
	backend := &fakeExeBackend{}
	svc := newExePatchService(backend)

	got, err := svc.ApplyExeSetting(context.Background(), "refillUrl", "https://b", "")
	if err == nil || err.Error() != "no exe open" {
		t.Fatalf("err = %v, want no exe open", err)
	}
	if got != nil {
		t.Fatalf("state = %+v, want nil", got)
	}
	if len(backend.calls) != 0 {
		t.Fatalf("backend calls = %v, want none", backend.calls)
	}
}

func TestApplyReturnsFreshStateAndMD5(t *testing.T) {
	backend := &fakeExeBackend{
		settings: []resolvedSetting{{s: exepatch.Setting{ID: "dllLoad", Label: "dll load", Value: "on", Editable: true}}},
		applyMD5: "0123456789abcdef0123456789abcdef",
	}
	svc := newExePatchService(backend)
	if _, err := svc.OpenExe(context.Background(), "/game/FantaTennis.exe"); err != nil {
		t.Fatal(err)
	}

	// Whatever the fake serves at apply time is the fresh read.
	backend.settings = []resolvedSetting{
		{s: exepatch.Setting{ID: "dllLoad", Label: "dll load", Value: "off", Editable: true}},
		{s: exepatch.Setting{ID: "refillUrl", Label: "Cookie refill URL", Value: "https://b", Editable: true, MaxLength: 199}},
	}
	got, err := svc.ApplyExeSetting(context.Background(), "dllLoad", "off", "")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"readSettings:/game/FantaTennis.exe",
		"apply:/game/FantaTennis.exe:dllLoad:off",
		"readSettings:/game/FantaTennis.exe",
	}
	if !reflect.DeepEqual(backend.calls, want) {
		t.Fatalf("calls = %v, want %v", backend.calls, want)
	}
	if got.MD5 != backend.applyMD5 {
		t.Fatalf("md5 = %q, want %q", got.MD5, backend.applyMD5)
	}
	if len(got.Settings) != 2 || got.Settings[0].Value != "off" ||
		got.Settings[1].ID != "refillUrl" {
		t.Fatalf("settings = %+v, want fresh read", got.Settings)
	}
	if got.Path != "/game/FantaTennis.exe" {
		t.Fatalf("path = %q", got.Path)
	}
}

func TestApplyBackendFailurePropagatesWithoutFreshRead(t *testing.T) {
	backend := &fakeExeBackend{
		settings: []resolvedSetting{{s: exepatch.Setting{ID: "dllLoad", Label: "dll load", Value: "on", Editable: true}}},
		applyMD5: "unused",
	}
	svc := newExePatchService(backend)
	if _, err := svc.OpenExe(context.Background(), "/game/FantaTennis.exe"); err != nil {
		t.Fatal(err)
	}
	readsBefore := countCalls(backend.calls, "readSettings:")

	want := errors.New("value too long")
	backend.applyErr = want
	got, err := svc.ApplyExeSetting(context.Background(), "refillUrl", "https://too/long", "")
	if !errors.Is(err, want) {
		t.Fatalf("err = %v, want %v", err, want)
	}
	if got != nil {
		t.Fatalf("state = %+v, want nil", got)
	}
	if reads := countCalls(backend.calls, "readSettings:"); reads != readsBefore {
		t.Fatalf("readSettings calls = %d, want %d (no fresh read after apply failure)",
			reads, readsBefore)
	}
}

func TestApplyCustomDllWithNameAppliesThenRenames(t *testing.T) {
	backend := &fakeExeBackend{
		settings:  []resolvedSetting{{s: exepatch.Setting{ID: "customDll", Label: "Custom DLL load", Value: "enabled", Editable: true}}},
		applyMD5:  "aaaa",
		renameMD5: "bbbb",
	}
	svc := newExePatchService(backend)
	if _, err := svc.OpenExe(context.Background(), "/game/FantaTennis.exe"); err != nil {
		t.Fatal(err)
	}
	got, err := svc.ApplyExeSetting(context.Background(), "customDll", "disabled", "other.dll")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"readSettings:/game/FantaTennis.exe",
		"apply:/game/FantaTennis.exe:customDll:disabled",
		"rename:/game/FantaTennis.exe:other.dll",
		"readSettings:/game/FantaTennis.exe",
	}
	if !reflect.DeepEqual(backend.calls, want) {
		t.Fatalf("calls = %v, want %v", backend.calls, want)
	}
	if got.MD5 != "bbbb" {
		t.Fatalf("md5 = %q, want the rename's md5 bbbb", got.MD5)
	}
}

func TestApplyCustomDllWithoutNameSkipsRename(t *testing.T) {
	backend := &fakeExeBackend{
		settings: []resolvedSetting{{s: exepatch.Setting{ID: "customDll", Label: "Custom DLL load", Value: "enabled", Editable: true}}},
		applyMD5: "aaaa",
	}
	svc := newExePatchService(backend)
	if _, err := svc.OpenExe(context.Background(), "/game/FantaTennis.exe"); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ApplyExeSetting(context.Background(), "customDll", "disabled", ""); err != nil {
		t.Fatal(err)
	}
	want := []string{
		"readSettings:/game/FantaTennis.exe",
		"apply:/game/FantaTennis.exe:customDll:disabled",
		"readSettings:/game/FantaTennis.exe",
	}
	if !reflect.DeepEqual(backend.calls, want) {
		t.Fatalf("calls = %v, want %v (no rename)", backend.calls, want)
	}
}

func TestApplyRenameFailurePropagatesWithoutFreshRead(t *testing.T) {
	backend := &fakeExeBackend{
		settings: []resolvedSetting{{s: exepatch.Setting{ID: "customDll", Label: "Custom DLL load", Value: "enabled", Editable: true}}},
		applyMD5: "aaaa",
	}
	svc := newExePatchService(backend)
	if _, err := svc.OpenExe(context.Background(), "/game/FantaTennis.exe"); err != nil {
		t.Fatal(err)
	}
	readsBefore := countCalls(backend.calls, "readSettings:")
	want := errors.New("name too long")
	backend.renameErr = want
	got, err := svc.ApplyExeSetting(context.Background(), "customDll", "enabled", "toolongname.dll")
	if !errors.Is(err, want) {
		t.Fatalf("err = %v, want %v", err, want)
	}
	if got != nil {
		t.Fatalf("state = %+v, want nil", got)
	}
	if reads := countCalls(backend.calls, "readSettings:"); reads != readsBefore {
		t.Fatalf("readSettings calls = %d, want %d (no fresh read after rename failure)", reads, readsBefore)
	}
}

func countCalls(calls []string, prefix string) int {
	n := 0
	for _, c := range calls {
		if strings.HasPrefix(c, prefix) {
			n++
		}
	}
	return n
}
