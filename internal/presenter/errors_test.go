package presenter

import (
	"encoding/json"
	"errors"
	"fmt"
	"testing"

	"github.com/icyzyy/fanta-tennis-res-kit/domain"
	"github.com/icyzyy/fanta-tennis-res-kit/usecase"
)

func parseCause(t *testing.T, raw []byte) struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Detail  string `json:"detail"`
} {
	t.Helper()
	var wire struct {
		Code    string `json:"code"`
		Message string `json:"message"`
		Detail  string `json:"detail"`
	}
	if raw == nil {
		t.Fatal("MarshalError returned nil")
	}
	if err := json.Unmarshal(raw, &wire); err != nil {
		t.Fatalf("payload is not JSON: %v (%s)", err, raw)
	}
	return wire
}

func TestMarshalErrorNil(t *testing.T) {
	if MarshalError(nil) != nil {
		t.Fatal("MarshalError(nil) must be nil (Wails falls back)")
	}
}

func TestMarshalErrorClassifiesInvalidXML(t *testing.T) {
	err := fmt.Errorf("save_entry Gui3.res/Gui_Login.set: %w: line 42: element foo", domain.ErrInvalidXML)
	wire := parseCause(t, MarshalError(err))
	if wire.Code != usecase.CodeInvalidXML {
		t.Fatalf("code = %q, want %q", wire.Code, usecase.CodeInvalidXML)
	}
	if wire.Message == "" {
		t.Fatal("message must not be empty")
	}
}

func TestMarshalErrorExtractsLineIntoDetail(t *testing.T) {
	err := fmt.Errorf("save_entry A.res/B.set: %w: line 42: element foo", domain.ErrInvalidXML)
	wire := parseCause(t, MarshalError(err))
	if wire.Detail != "42" {
		t.Fatalf("detail = %q, want %q", wire.Detail, "42")
	}
}

func TestMarshalErrorStructuralInvalidXMLKeepsDetailEmpty(t *testing.T) {
	err := fmt.Errorf("save_entry A.res/B.set: %w: expected exactly one root element", domain.ErrInvalidXML)
	wire := parseCause(t, MarshalError(err))
	if wire.Code != usecase.CodeInvalidXML || wire.Detail != "" {
		t.Fatalf("wire = %+v", wire)
	}
}

func TestMarshalErrorUnknownIsInternal(t *testing.T) {
	wire := parseCause(t, MarshalError(errors.New("boom")))
	if wire.Code != usecase.CodeInternal {
		t.Fatalf("code = %q, want %q", wire.Code, usecase.CodeInternal)
	}
}

func TestMarshalErrorNotFound(t *testing.T) {
	err := fmt.Errorf("read_entry: %w", domain.ErrNoSuchEntry)
	wire := parseCause(t, MarshalError(err))
	if wire.Code != usecase.CodeNotFound {
		t.Fatalf("code = %q, want %q", wire.Code, usecase.CodeNotFound)
	}
}
