package presenter

import (
	"encoding/json"
	"regexp"

	"github.com/icyzyy/fanta-tennis-res-kit/usecase"
)

// xmlLineRe matches the "line 42" fragment encoding/xml puts into
// well-formedness errors (and reskit's stricter validateXML wraps).
var xmlLineRe = regexp.MustCompile(`line (\d+)`)

// MarshalError converts any driver-layer error into the JSON payload Wails
// ships as RuntimeError.cause — {code, message, detail}. Contract: never
// fails; nil for nil (Wails falls back to its default marshalling).
func MarshalError(err error) []byte {
	if err == nil {
		return nil
	}
	appErr := usecase.Classify(err)
	if appErr == nil {
		return nil
	}
	// Enrich invalid_xml failures with the offending line so the editor can
	// place its inline marker without parsing Go messages.
	if appErr.Code == usecase.CodeInvalidXML && appErr.Detail == "" {
		if m := xmlLineRe.FindStringSubmatch(appErr.Message); m != nil {
			appErr.Detail = m[1]
		}
	}
	raw, mErr := json.Marshal(appErr)
	if mErr != nil {
		return nil // fall back rather than break the error channel
	}
	return raw
}
