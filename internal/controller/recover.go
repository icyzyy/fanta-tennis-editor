package controller

import "fmt"

// recoverAs implements the spec §5 driver rule: panics are recovered only at
// driver boundaries and surface as normal errors (marshalled to
// {code:"internal"}) instead of tearing down the host process. Every bound
// service method defers it with a named error result:
//
//	defer recoverAs("op_name", &err)
func recoverAs(op string, err *error) {
	if r := recover(); r != nil {
		*err = fmt.Errorf("%s: panic: %v", op, r)
	}
}
