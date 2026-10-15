package controller

import (
	"github.com/icyzyy/fanta-tennis-exe-patcher/exepatch"
)

// Ports consumed by ExePatchService. Satisfied by kitBackend (wired in the
// public constructor) or by fakes in tests.
type exeBackend interface {
	readSettings(path string) ([]resolvedSetting, error)
	apply(path, id, value string) (string, error) // returns md5
	rename(path, name string) (string, error)     // returns md5
}

// kitBackend is the thin adapter over the pinned kit library. The port is
// unexported: the kit exposes package functions (no interactor ctor like
// reskit), so the kit backend is constructed inside the public constructor
// and tests inject fakes through newExePatchService.
type kitBackend struct{}

func (kitBackend) readSettings(path string) ([]resolvedSetting, error) {
	e, err := exepatch.OpenExe(path, exepatch.DefaultAnchors())
	if err != nil {
		return nil, err
	}
	out := make([]resolvedSetting, 0, len(e.Settings()))
	for _, s := range e.Settings() {
		r := resolvedSetting{s: s}
		if s.MaxLength == 0 { // the custom-DLL setting
			name, err := e.CustomDllName()
			if err != nil {
				if s.Editable {
					r.nameReason = err.Error()
				} else {
					r.nameReason = s.Reason
				}
			} else {
				r.name = name
				r.nameEditable = true
			}
		}
		out = append(out, r)
	}
	return out, nil
}

func (kitBackend) apply(path, id, value string) (string, error) {
	e, err := exepatch.OpenExe(path, exepatch.DefaultAnchors())
	if err != nil {
		return "", err
	}
	return e.Apply(id, value)
}

func (kitBackend) rename(path, name string) (string, error) {
	e, err := exepatch.OpenExe(path, exepatch.DefaultAnchors())
	if err != nil {
		return "", err
	}
	return e.RenameCustomDll(name)
}
