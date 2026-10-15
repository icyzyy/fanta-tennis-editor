package controller

import (
	"reflect"
	"testing"

	"fanta-tennis-editor/internal/domain"
	"github.com/icyzyy/fanta-tennis-exe-patcher/exepatch"
	"github.com/icyzyy/fanta-tennis-res-kit/usecase"
)

// The bound boundary must survive a domain→usecase→domain round trip with
// no field loss: the generated bindings only ever see domain types, and the
// engine only ever sees usecase types.

func TestWorkspaceOf(t *testing.T) {
	in := &usecase.Workspace{
		Root: "/data/Res",
		Archives: []usecase.ArchiveInfo{
			{Path: "/data/Res/Gui2.res", Size: 42, ModTime: 1700000000},
		},
	}
	out := workspaceOf(in)
	want := &domain.Workspace{
		Root: "/data/Res",
		Archives: []domain.ArchiveInfo{
			{Path: "/data/Res/Gui2.res", Size: 42, ModTime: 1700000000},
		},
	}
	if !reflect.DeepEqual(out, want) {
		t.Fatalf("workspaceOf = %+v, want %+v", out, want)
	}
	if workspaceOf(nil) != nil {
		t.Fatal("workspaceOf(nil) must stay nil")
	}
}

func TestSaveMapping(t *testing.T) {
	req := domain.SaveRequest{Archive: "Gui2.res", Entry: "L.set", Text: "<a/>"}
	got := saveRequestOf(req)
	if got != (usecase.SaveRequest{Archive: "Gui2.res", Entry: "L.set", Text: "<a/>"}) {
		t.Fatalf("saveRequestOf = %+v", got)
	}
	res := saveResultOf(&usecase.SaveResult{OK: true, Revision: 7})
	if res == nil || !res.OK || res.Revision != 7 {
		t.Fatalf("saveResultOf = %+v", res)
	}
	if saveResultOf(nil) != nil {
		t.Fatal("saveResultOf(nil) must stay nil")
	}
}

func TestSearchMapping(t *testing.T) {
	req := domain.SearchRequest{
		Root: "/data/Res", Archive: "Gui2.res", Query: "modulator", CaseSensitive: true,
	}
	got := searchRequestOf(req)
	want := usecase.SearchRequest{
		Root: "/data/Res", Archive: "Gui2.res", Query: "modulator", CaseSensitive: true,
	}
	if got != want {
		t.Fatalf("searchRequestOf = %+v, want %+v", got, want)
	}
	hit := searchHitOf(usecase.SearchHit{
		Archive: "/data/Res/Gui2.res", Entry: "L.set", Line: 57767, Text: `Mod="x"`,
	})
	if hit.Archive != "/data/Res/Gui2.res" || hit.Entry != "L.set" ||
		hit.Line != 57767 || hit.Text != `Mod="x"` || hit.Warning != "" {
		t.Fatalf("searchHitOf = %+v", hit)
	}
	warn := searchHitOf(usecase.SearchHit{Archive: "Bad.res", Warning: "corrupt zip"})
	if warn.Warning != "corrupt zip" {
		t.Fatalf("searchHitOf warning = %+v", warn)
	}
}

func TestExtractMapping(t *testing.T) {
	req := domain.ExtractRequest{
		Archive: "Gui2.res", Entries: []string{"A.set"}, Dest: "/tmp/out", Decrypted: true,
	}
	got := extractRequestOf(req)
	if !reflect.DeepEqual(got, usecase.ExtractRequest{
		Archive: "Gui2.res", Entries: []string{"A.set"}, Dest: "/tmp/out", Decrypted: true,
	}) {
		t.Fatalf("extractRequestOf = %+v", got)
	}
	whole := extractRequestOf(domain.ExtractRequest{Archive: "Gui2.res", Dest: "/o"})
	if whole.Entries != nil {
		t.Fatalf("empty selection must map to nil Entries, got %+v", whole.Entries)
	}
	res := extractResultOf(&usecase.ExtractResult{Files: []string{"a.xml"}})
	if res == nil || len(res.Files) != 1 || res.Files[0] != "a.xml" {
		t.Fatalf("extractResultOf = %+v", res)
	}
	if extractResultOf(nil) != nil {
		t.Fatal("extractResultOf(nil) must stay nil")
	}
}

func TestExeSettingMapping(t *testing.T) {
	// A disabled custom-DLL setting keeps its Reason, and the name is
	// uneditable for the same reason.
	disabled := exeSettingOf(resolvedSetting{
		s: exepatch.Setting{
			ID: "customDll", Label: "Custom DLL load", Editable: false,
			Reason: "not the expected code cave",
		},
		nameReason: "not the expected code cave",
	})
	if disabled.Reason != "not the expected code cave" || disabled.NameEditable ||
		disabled.Name != "" || disabled.NameReason != "not the expected code cave" ||
		disabled.ID != "customDll" {
		t.Fatalf("exeSettingOf(disabled) = %+v", disabled)
	}
	// An editable custom-DLL setting carries its decoded name across.
	editable := exeSettingOf(resolvedSetting{
		s: exepatch.Setting{
			ID: "customDll", Label: "Custom DLL load", Value: "enabled",
			Editable: true,
		},
		name: "jftse.dll", nameEditable: true,
	})
	if editable.Value != "enabled" || !editable.Editable || editable.Name != "jftse.dll" ||
		!editable.NameEditable || editable.NameReason != "" {
		t.Fatalf("exeSettingOf(editable) = %+v", editable)
	}
	// A URL setting keeps the name fields zero-valued.
	url := exeSettingOf(resolvedSetting{
		s: exepatch.Setting{
			ID: "refillUrl", Label: "Cookie refill URL", Value: "https://a",
			Editable: true, MaxLength: 127,
		},
	})
	if url.Name != "" || url.NameEditable || url.NameReason != "" || url.MaxLength != 127 {
		t.Fatalf("exeSettingOf(url) = %+v", url)
	}
}
