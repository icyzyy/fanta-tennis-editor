import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toAppError } from "../api";
import { useAppStore } from "../state/appStore";
import { useExeStore } from "../state/exeStore";
import { useToastStore } from "../state/toastStore";

const withDll = (n: string) => (n === "" ? "" : n.endsWith(".dll") ? n : n + ".dll");

export function ExePanel() {
  const path = useExeStore((s) => s.path);
  const settings = useExeStore((s) => s.settings);
  const md5 = useExeStore((s) => s.md5);
  const applying = useExeStore((s) => s.applying);
  const setMode = useAppStore((s) => s.setMode);
  // Local edits staged per setting id; the store value shows until applied.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});

  const handleBack = () => {
    useExeStore.getState().reset();
    setMode("picker");
  };



  return (
    <div className="flex h-screen flex-col bg-[#0a0a0a]">
      <header
        id="exe-header"
        className="flex items-center gap-3 border-b border-white/10 bg-[#151515] px-3 py-2"
      >
        <button
          type="button"
          onClick={handleBack}
          disabled={applying}
          aria-label="Back to picker"
          className="flex items-center gap-2 rounded bg-white/5 px-3 py-1.5 text-sm font-medium text-gray-300 hover:bg-white/10 disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to picker
        </button>
        <span className="max-w-64 truncate font-mono text-xs text-gray-400">
          {path}
        </span>
        {md5 !== "" && (
          <span className="ml-auto shrink-0 font-mono text-xs text-gray-500">
            md5: {md5}
          </span>
        )}
      </header>

      {/* flex-1 + min-h-0: takes the space under the header and scrolls the
          settings itself when the window is short (h-full never resolved —
          no parent in the chain has a height). */}
      <div
        id="exe-settings"
        className="flex min-h-0 flex-1 flex-col divide-y divide-white/5 overflow-auto p-3"
      >
        {settings.map((s) => {
          const value = drafts[s.id] ?? s.value;

          if (!s.editable) {
            return (
              <div
                key={s.id}
                className="rounded bg-white/[0.02] px-3 py-2 opacity-60"
              >
                <div className="text-xs text-gray-500">{s.label}</div>
                <div className="font-mono text-sm text-gray-500">{s.value}</div>
                {s.reason !== "" && (
                  <p className="mt-1 text-xs text-gray-600">{s.reason}</p>
                )}
              </div>
            );
          }

          return (
            <div
              key={s.id}
              className="flex items-center gap-3 px-3 py-2"
            >
              <label
                htmlFor={`exe-${s.id}`}
                className="w-40 shrink-0 text-xs text-gray-400"
              >
                {s.label}
              </label>
              {s.maxLength === 0 ? (
                (() => {
                  const nameValue = nameDrafts[s.id] ?? s.name;
                  return (
                    <>
                      <label className="flex items-center gap-1.5 text-xs text-gray-300">
                        <input
                          type="checkbox"
                          aria-label="Enabled"
                          checked={value === "enabled"}
                          disabled={applying}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [s.id]: e.target.checked ? "enabled" : "disabled" }))
                          }
                          className="accent-indigo-500"
                        />
                        Enabled
                      </label>
                      <input
                        id={`exe-${s.id}`}
                        type="text"
                        maxLength={9}
                        value={nameValue}
                        disabled={!s.nameEditable}
                        onChange={(e) => setNameDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                        onBlur={() => {
                          const v = nameDrafts[s.id];
                          if (v !== undefined) setNameDrafts((d) => ({ ...d, [s.id]: withDll(v) }));
                        }}
                        className="w-32 rounded border border-white/10 bg-black/30 px-2 py-1 font-mono text-sm outline-none focus:border-indigo-500 disabled:opacity-50"
                      />
                      <span className="text-[10px] text-gray-600">
                        {s.nameEditable ? "≤9 chars, .dll auto-added" : s.nameReason}
                      </span>
                    </>
                  );
                })()
              ) : (
                <input
                  id={`exe-${s.id}`}
                  type="text"
                  maxLength={s.maxLength}
                  value={value}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [s.id]: e.target.value }))
                  }
                  className="min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-2 py-1 font-mono text-sm outline-none focus:border-indigo-500"
                />
              )}
              <button
                type="button"
                aria-label={`Apply ${s.label}`}
                disabled={applying}
                onClick={() => {
                  if (s.maxLength === 0) {
                    const nameValue = nameDrafts[s.id] ?? s.name;
                    void useExeStore.getState().apply(
                      s.id,
                      value,
                      s.nameEditable ? withDll(nameValue) : "",
                    ).then(() => {
                      setDrafts((d) => { const rest = { ...d }; delete rest[s.id]; return rest; });
                      setNameDrafts((d) => { const rest = { ...d }; delete rest[s.id]; return rest; });
                      useToastStore.getState().push("success", `Applied ${s.label} — md5 ${useExeStore.getState().md5}`);
                    }).catch((e) => {
                      useToastStore.getState().push("error", toAppError(e).message);
                    });
                  } else {
                    const nameValue = nameDrafts[s.id] ?? s.name;
                    void useExeStore.getState().apply(s.id, value, nameValue).then(() => {
                      setDrafts((d) => { const rest = { ...d }; delete rest[s.id]; return rest; });
                      useToastStore.getState().push("success", `Applied ${s.label} — md5 ${useExeStore.getState().md5}`);
                    }).catch((e) => {
                      useToastStore.getState().push("error", toAppError(e).message);
                    });
                  }
                }}
                className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
