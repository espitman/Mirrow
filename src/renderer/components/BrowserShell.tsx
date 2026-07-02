import { useCallback, useEffect, useRef, useState } from "react";
import type { BrowserState, TranslationProgress } from "../../shared/types";
import { BrowserToolbar } from "./BrowserToolbar";
import { TranslateControls } from "./TranslateControls";

const INITIAL_BROWSER_STATE: BrowserState = {
  url: "",
  title: "",
  canGoBack: false,
  canGoForward: false,
  isLoading: false,
};

export function BrowserShell() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [browserState, setBrowserState] = useState(INITIAL_BROWSER_STATE);
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [targetLanguage, setTargetLanguage] = useState("Persian");
  const [isTranslating, setIsTranslating] = useState(false);
  const [instantTranslateMode, setInstantTranslateMode] = useState(false);
  const [progress, setProgress] = useState<TranslationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [lastNavigationInput, setLastNavigationInput] = useState("");

  const syncBounds = useCallback(() => {
    const element = viewportRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    window.mirrow.browser.setBounds({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });
  }, []);

  useEffect(() => {
    syncBounds();
    const resizeObserver = new ResizeObserver(syncBounds);
    if (viewportRef.current) resizeObserver.observe(viewportRef.current);
    window.addEventListener("resize", syncBounds);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncBounds);
      window.mirrow.browser.setExclusionMode(false).catch(() => undefined);
      window.mirrow.browser.setSelectionMode(false).catch(() => undefined);
      window.mirrow.browser.setInstantTranslateMode(false).catch(() => undefined);
      window.mirrow.browser.setBounds({ x: 0, y: 0, width: 0, height: 0 }).catch(() => undefined);
    };
  }, [syncBounds]);

  useEffect(() => {
    window.mirrow.browser.getState().then(setBrowserState).catch(() => undefined);
    const offState = window.mirrow.browser.onState(setBrowserState);
    const offProgress = window.mirrow.translation.onProgress(setProgress);
    const offError = window.mirrow.translation.onError(setError);
    const offComplete = window.mirrow.translation.onComplete((payload) => {
      setProgress({ completed: payload.total, total: payload.total, message: `Translated ${payload.translatedCount} / ${payload.total} text nodes` });
      setIsTranslating(false);
    });
    return () => {
      offState();
      offProgress();
      offError();
      offComplete();
    };
  }, []);

  const loadUrl = async (url: string) => {
    setError(null);
    setNavigationError(null);
    setLastNavigationInput(url);
    setInstantTranslateMode(false);
    window.mirrow.browser.setInstantTranslateMode(false).catch(() => undefined);
    try {
      const nextState = await window.mirrow.browser.loadUrl(url);
      setBrowserState(nextState);
      setNavigationError(null);
    } catch (nextError) {
      setNavigationError(nextError instanceof Error ? nextError.message : String(nextError));
      throw nextError;
    }
  };

  const translate = () => {
    setError(null);
    setProgress(null);
    setIsTranslating(true);
    window.mirrow.translation
      .start({ sourceLanguage, targetLanguage, selectedOnly: false })
      .catch((nextError: Error) => setError(nextError.message))
      .finally(() => setIsTranslating(false));
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="drag-region h-9 shrink-0 border-b border-white/10 bg-black/20" />
      <BrowserToolbar
        state={browserState}
        onLoadUrl={loadUrl}
        onBack={() => window.mirrow.browser.goBack().then(setBrowserState)}
        onForward={() => window.mirrow.browser.goForward().then(setBrowserState)}
        onReload={() => window.mirrow.browser.reload().then(setBrowserState)}
        navigationError={navigationError}
        onRetry={() => {
          if (lastNavigationInput) void loadUrl(lastNavigationInput);
        }}
      />
      <TranslateControls
        sourceLanguage={sourceLanguage}
        targetLanguage={targetLanguage}
        isTranslating={isTranslating}
        progress={progress}
        error={error}
        instantTranslateMode={instantTranslateMode}
        onSourceLanguageChange={setSourceLanguage}
        onTargetLanguageChange={setTargetLanguage}
        onTranslate={translate}
        onCancel={() => {
          window.mirrow.translation.cancel().catch((nextError: Error) => setError(nextError.message));
          setIsTranslating(false);
        }}
        onToggleInstantTranslateMode={() => {
          const next = !instantTranslateMode;
          setInstantTranslateMode(next);
          window.mirrow.browser
            .setInstantTranslateMode(next)
            .then((state) => setInstantTranslateMode(state.enabled))
            .catch((nextError: Error) => {
              setInstantTranslateMode(!next);
              setError(nextError.message);
            });
        }}
      />
      <div className="relative min-h-0 flex-1 bg-[#f8fafc]" ref={viewportRef}>
        {!browserState.url && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#101329] text-center">
            <div>
              <div className="text-2xl font-semibold text-white">Mirrow is ready</div>
              <div className="mt-2 text-sm text-slate-400">Enter a URL above to load a website.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
