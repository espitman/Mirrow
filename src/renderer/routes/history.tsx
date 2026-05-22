import { Clock3, ExternalLink, Trash2 } from "lucide-react";
import { useClearHistoryMutation, useHistoryQuery } from "../lib/hooks";

export function HistoryPage() {
  const history = useHistoryQuery();
  const clearHistory = useClearHistoryMutation();

  const openUrl = (url: string) => {
    window.mirrow.browser.loadUrl(url).catch(() => undefined);
  };

  return (
    <section className="flex h-full flex-col overflow-hidden p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">History</h1>
          <p className="mt-1 text-sm text-slate-400">Recently translated pages.</p>
        </div>
        <button className="secondary-button" onClick={() => clearHistory.mutate()} disabled={!history.data?.length}>
          <Trash2 size={16} />
          Clear
        </button>
      </header>

      <div className="glass min-h-0 flex-1 overflow-auto rounded-xl">
        {!history.data?.length ? (
          <div className="flex h-full items-center justify-center text-center">
            <div>
              <Clock3 className="mx-auto text-slate-500" size={28} />
              <div className="mt-3 text-sm text-slate-300">No translated pages yet.</div>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {history.data.map((item) => (
              <article key={item.id} className="flex items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{item.title || item.url}</div>
                  <div className="mt-1 truncate text-xs text-slate-400">{item.url}</div>
                </div>
                <div className="w-28 text-sm text-slate-300">{item.targetLanguage}</div>
                <div className="w-44 text-xs text-slate-500">{new Date(item.translatedAt).toLocaleString()}</div>
                <button className="icon-button" onClick={() => openUrl(item.url)} title="Open again">
                  <ExternalLink size={16} />
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
