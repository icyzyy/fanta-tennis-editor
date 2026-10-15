// AppError mirrors Go's usecase.AppError as marshalled by presenter.MarshalError.
export interface AppError {
  code: string; // "invalid_xml", "not_found", "io", "internal", …
  message: string;
  detail?: string; // offending line for invalid_xml
}

/**
 * Normalises whatever the bindings reject with. Wails ships structured
 * errors as RuntimeError.cause = JSON.parse(MarshalError(err))
 * = {code, message, detail}.
 */
export function toAppError(e: unknown): AppError {
  if (e && typeof e === "object" && "cause" in e) {
    const cause = (e as { cause?: unknown }).cause;
    if (
      cause &&
      typeof cause === "object" &&
      typeof (cause as AppError).code === "string"
    ) {
      return cause as AppError;
    }
  }
  if (e instanceof Error) return { code: "internal", message: e.message };
  return { code: "internal", message: String(e) };
}

/** True for a promise aborted via CancellablePromise.cancel(). */
export function isCancel(e: unknown): boolean {
  return e instanceof Error && e.name === "CancelError";
}
