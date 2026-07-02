import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ClipboardPaste, Menu, RefreshCw, Search, ShieldCheck, Star } from "lucide-react";
import type { BrowserState } from "../../shared/types";
import { resolveNavigationInput } from "../../shared/navigation";
import { useHistoryQuery } from "../lib/hooks";

type AddressSuggestion = {
  id: string;
  title: string;
  url: string;
  subtitle: string;
};

type BrowserToolbarProps = {
  state: BrowserState;
  onLoadUrl: (url: string) => Promise<void>;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  navigationError: string | null;
  onRetry: () => void;
};

export function BrowserToolbar({ state, onLoadUrl, onBack, onForward, onReload, navigationError, onRetry }: BrowserToolbarProps) {
  const history = useHistoryQuery();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [pendingUrl, setPendingUrl] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);

  useEffect(() => {
    if (!isEditing && !pendingUrl) setValue(state.url);
    if (pendingUrl && state.url === pendingUrl) {
      setPendingUrl("");
      setValue(state.url);
    }
  }, [isEditing, pendingUrl, state.url]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "l") {
        event.preventDefault();
        focusAddressBar();
        return;
      }
      if (modifier && event.key.toLowerCase() === "r") {
        event.preventDefault();
        onReload();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onReload]);

  const suggestions = useMemo(() => {
    if (!showSuggestions) return [];
    const query = value.trim().toLowerCase();
    if (!query) return [];
    let currentSuggestion: AddressSuggestion | null = null;
    try {
      const target = resolveNavigationInput(value);
      currentSuggestion = {
        id: "__current_input__",
        title: target.type === "search" ? `Search Google for "${value.trim()}"` : `Go to ${target.input}`,
        url: target.url,
        subtitle: target.url,
      };
    } catch {
      currentSuggestion = null;
    }

    const historySuggestions = (history.data ?? [])
      .filter((item) => {
        const haystack = `${item.title ?? ""} ${item.url}`.toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 4)
      .map((item) => ({
        id: item.id,
        title: item.title || item.url,
        url: item.url,
        subtitle: item.url,
      }));

    return currentSuggestion ? [currentSuggestion, ...historySuggestions] : historySuggestions;
  }, [history.data, showSuggestions, value]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void submitValue();
  };

  const submitValue = async (nextValue = value) => {
    try {
      const target = resolveNavigationInput(nextValue);
      setValue(target.url);
      setPendingUrl(target.url);
      setIsEditing(false);
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
      await onLoadUrl(target.url).catch(() => undefined);
    } catch {
      focusAddressBar();
    }
  };

  const pasteAndRun = async () => {
    const text = await navigator.clipboard.readText();
    await submitValue(text);
  };

  const focusAddressBar = () => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    requestAnimationFrame(() => input.select());
  };

  const onInputFocus = () => {
    setIsEditing(true);
    setShowSuggestions(true);
    requestAnimationFrame(() => inputRef.current?.select());
  };

  const onInputBlur = () => {
    window.setTimeout(() => {
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
      setIsEditing(false);
      if (!pendingUrl) setValue(state.url);
    }, 120);
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setValue(state.url);
      setPendingUrl("");
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
      inputRef.current?.blur();
      return;
    }

    if (event.key === "ArrowDown" && suggestions.length) {
      event.preventDefault();
      setSelectedSuggestionIndex((current) => Math.min(suggestions.length - 1, current + 1));
      return;
    }

    if (event.key === "ArrowUp" && suggestions.length) {
      event.preventDefault();
      setSelectedSuggestionIndex((current) => Math.max(0, current - 1));
      return;
    }

    if (event.key === "Enter" && selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
      event.preventDefault();
      void submitValue(suggestions[selectedSuggestionIndex].url);
    }
  };

  return (
    <div className="border-b border-white/10 bg-[#0c0f22]/92">
      <form onSubmit={submit} className="relative flex items-center gap-2 px-4 py-3">
        <button type="button" className="icon-button" onClick={onBack} disabled={!state.canGoBack} title="Back">
          <ArrowLeft size={17} />
        </button>
        <button type="button" className="icon-button" onClick={onForward} disabled={!state.canGoForward} title="Forward">
          <ArrowRight size={17} />
        </button>
        <button type="button" className="icon-button" onClick={onReload} title="Reload">
          <RefreshCw className={state.isLoading ? "animate-spin" : ""} size={17} />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3">
          <ShieldCheck className="shrink-0 text-emerald-300" size={17} />
          <input
            ref={inputRef}
            value={value}
            onBlur={onInputBlur}
            onChange={(event) => {
              setValue(event.target.value);
              setPendingUrl("");
              setShowSuggestions(true);
              setSelectedSuggestionIndex(-1);
            }}
            onFocus={onInputFocus}
            onKeyDown={onInputKeyDown}
            placeholder="Search Google or enter a URL"
            className="h-10 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
          />
        </div>
        <button type="button" className="icon-button" onClick={pasteAndRun} title="Paste & Run">
          <ClipboardPaste size={16} />
        </button>
        <button type="button" className="icon-button" title="Favorite">
          <Star size={17} />
        </button>
        <button type="button" className="icon-button" title="Menu">
          <Menu size={18} />
        </button>
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute left-[156px] right-[148px] top-[58px] z-30 overflow-hidden rounded-lg border border-white/10 bg-[#111429] shadow-2xl">
            {suggestions.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`flex w-full items-center gap-3 px-3 py-2 text-left transition ${
                  index === selectedSuggestionIndex ? "bg-violet/25" : "hover:bg-white/[0.06]"
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void submitValue(item.url)}
              >
                <Search className="shrink-0 text-slate-500" size={15} />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-slate-100">{item.title}</span>
                  <span className="block truncate text-xs text-slate-500">{item.subtitle}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </form>
      {navigationError && (
        <div className="flex items-center justify-between gap-3 border-t border-rose-400/20 bg-rose-500/10 px-4 py-2 text-xs text-rose-100">
          <span className="truncate">{navigationError}</span>
          <button type="button" className="rounded-md border border-rose-300/30 px-2 py-1 font-medium hover:bg-rose-300/10" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
