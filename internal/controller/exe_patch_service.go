package controller

import (
	"context"
	"errors"
	"sync"

	"fanta-tennis-editor/internal/domain"
)

// ExePatchService binds exe patching: open FantaTennis.exe, read every
// setting live from the binary, apply one setting and report the written
// file's MD5. All operations serialise on mu; the kit backend reopens the
// file per call, so Apply reads a fresh state to mirror what landed on disk.
type ExePatchService struct {
	mu      sync.Mutex
	path    string // set by OpenExe, used by ApplyExeSetting (spec §217-218)
	backend exeBackend
}

// NewExePatchService wires the kit backend (the unexported port keeps kit
// types out of the constructor signature).
func NewExePatchService() *ExePatchService { return newExePatchService(kitBackend{}) }

func newExePatchService(b exeBackend) *ExePatchService { return &ExePatchService{backend: b} }

// OpenExe reads every setting live from the binary and remembers path.
func (s *ExePatchService) OpenExe(ctx context.Context, path string) (out *domain.ExeState, err error) {
	defer recoverAs("open_exe", &err)
	s.mu.Lock()
	defer s.mu.Unlock()
	settings, err := s.backend.readSettings(path)
	if err != nil {
		return nil, err // path unchanged
	}
	s.path = path
	return exeStateOf(path, settings, ""), nil
}

// ApplyExeSetting applies one setting to the open exe and, when name is
// non-empty, renames the custom DLL; it returns the freshly re-resolved
// state plus the md5 of the last write.
func (s *ExePatchService) ApplyExeSetting(ctx context.Context, id, value, name string) (out *domain.ExeState, err error) {
	defer recoverAs("apply_exe_setting", &err)
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.path == "" {
		return nil, errors.New("no exe open")
	}
	md5, err := s.backend.apply(s.path, id, value)
	if err != nil {
		return nil, err
	}
	if name != "" {
		md5, err = s.backend.rename(s.path, name)
		if err != nil {
			return nil, err
		}
	}
	settings, err := s.backend.readSettings(s.path) // fresh read — UI mirrors the file
	if err != nil {
		return nil, err
	}
	return exeStateOf(s.path, settings, md5), nil
}
