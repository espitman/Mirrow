import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Menu, RefreshCw, ShieldCheck, Star } from "lucide-react";
import type { BrowserState } from "../../shared/types";

type BrowserToolbarProps = {
  state: BrowserState;
  onLoadUrl: (url: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
};

export function BrowserToolbar({ state, onLoadUrl, onBack, onForward, onReload }: BrowserToolbarProps) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (state.url) setUrl(state.url);
  }, [state.url]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onLoadUrl(url);
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2 border-b border-white/10 bg-[#0c0f22]/92 px-4 py-3">
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
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="Enter a URL"
          className="h-10 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
        />
      </div>
      <button type="button" className="icon-button" title="Favorite">
        <Star size={17} />
      </button>
      <button type="button" className="icon-button" title="Menu">
        <Menu size={18} />
      </button>
    </form>
  );
}
