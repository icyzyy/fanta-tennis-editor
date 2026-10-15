package controller

import (
	"fanta-tennis-editor/internal/domain"
	"github.com/icyzyy/fanta-tennis-exe-patcher/exepatch"
	"github.com/icyzyy/fanta-tennis-res-kit/usecase"
)

// Edge conversions between the editor-owned boundary messages and the
// engine's usecase types. Ports stay usecase-typed (adapter side); only
// what crosses the binding edge is converted. JSON wire shapes are
// identical by construction (domain mirrors the tags) — these functions
// keep the Go sides honest under test.

func workspaceOf(w *usecase.Workspace) *domain.Workspace {
	if w == nil {
		return nil
	}
	out := &domain.Workspace{Root: w.Root}
	if w.Archives != nil {
		out.Archives = make([]domain.ArchiveInfo, len(w.Archives))
		for i, a := range w.Archives {
			out.Archives[i] = domain.ArchiveInfo{Path: a.Path, Size: a.Size, ModTime: a.ModTime}
		}
	}
	return out
}

func saveRequestOf(req domain.SaveRequest) usecase.SaveRequest {
	return usecase.SaveRequest{Archive: req.Archive, Entry: req.Entry, Text: req.Text}
}

func saveResultOf(res *usecase.SaveResult) *domain.SaveResult {
	if res == nil {
		return nil
	}
	return &domain.SaveResult{OK: res.OK, Revision: res.Revision}
}

func searchRequestOf(req domain.SearchRequest) usecase.SearchRequest {
	return usecase.SearchRequest{
		Root:          req.Root,
		Archive:       req.Archive,
		Query:         req.Query,
		CaseSensitive: req.CaseSensitive,
	}
}

func searchHitOf(h usecase.SearchHit) domain.SearchHit {
	return domain.SearchHit{
		Archive: h.Archive,
		Entry:   h.Entry,
		Line:    h.Line,
		Text:    h.Text,
		Warning: h.Warning,
	}
}

func extractRequestOf(req domain.ExtractRequest) usecase.ExtractRequest {
	return usecase.ExtractRequest{
		Archive:   req.Archive,
		Entries:   req.Entries,
		Dest:      req.Dest,
		Decrypted: req.Decrypted,
	}
}

func extractResultOf(res *usecase.ExtractResult) *domain.ExtractResult {
	if res == nil {
		return nil
	}
	return &domain.ExtractResult{Files: res.Files}
}

// resolvedSetting is one library setting plus the decoded custom-DLL name
// (the name fields are zero-valued for the URL settings).
type resolvedSetting struct {
	s            exepatch.Setting
	name         string
	nameEditable bool
	nameReason   string
}

func exeStateOf(path string, settings []resolvedSetting, md5sum string) *domain.ExeState {
	out := &domain.ExeState{Path: path, MD5: md5sum}
	if settings != nil {
		out.Settings = make([]domain.ExeSetting, len(settings))
		for i, s := range settings {
			out.Settings[i] = exeSettingOf(s)
		}
	}
	return out
}

func exeSettingOf(r resolvedSetting) domain.ExeSetting {
	return domain.ExeSetting{
		ID:           r.s.ID,
		Label:        r.s.Label,
		Value:        r.s.Value,
		Editable:     r.s.Editable,
		Reason:       r.s.Reason,
		MaxLength:    r.s.MaxLength,
		Name:         r.name,
		NameEditable: r.nameEditable,
		NameReason:   r.nameReason,
	}
}
