package domain

// ExeState is the result of opening FantaTennis.exe or applying one of its
// settings: the file's path, every setting resolved live from the current
// bytes, and the MD5 of the last successful Apply ("" right after OpenExe).
type ExeState struct {
	Path     string       `json:"path"`
	Settings []ExeSetting `json:"settings"`
	MD5      string       `json:"md5"` // last successful Apply; "" after Open
}

// ExeSetting is one patchable value read out of the exe. When Editable is
// false the build did not match: Value is empty and Reason says why.
// MaxLength is the longest value Apply accepts (0 for the enum-valued
// dllLoad setting).
type ExeSetting struct {
	ID           string `json:"id"`
	Label        string `json:"label"`
	Value        string `json:"value"`
	Editable     bool   `json:"editable"`
	Reason       string `json:"reason"`
	MaxLength    int    `json:"maxLength"`
	Name         string `json:"name"`         // decoded DLL name; "" when absent/undecodable
	NameEditable bool   `json:"nameEditable"` // name editable (setting editable + name decodes)
	NameReason   string `json:"nameReason"`   // why the name is not editable; "" when editable
}
