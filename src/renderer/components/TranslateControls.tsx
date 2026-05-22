import { Languages, Square, Zap } from "lucide-react";
import { LANGUAGE_OPTIONS } from "../../shared/constants";
import type { TranslationProgress } from "../../shared/types";

type TranslateControlsProps = {
  sourceLanguage: string;
  targetLanguage: string;
  isTranslating: boolean;
  progress: TranslationProgress | null;
  error: string | null;
  instantTranslateMode: boolean;
  onSourceLanguageChange: (value: string) => void;
  onTargetLanguageChange: (value: string) => void;
  onTranslate: () => void;
  onCancel: () => void;
  onToggleInstantTranslateMode: () => void;
};

export function TranslateControls({
  sourceLanguage,
  targetLanguage,
  isTranslating,
  progress,
  error,
  instantTranslateMode,
  onSourceLanguageChange,
  onTargetLanguageChange,
  onTranslate,
  onCancel,
  onToggleInstantTranslateMode,
}: TranslateControlsProps) {
  const percent = progress ? Math.round((progress.completed / Math.max(progress.total, 1)) * 100) : 0;

  return (
    <section className="border-b border-white/10 bg-[#0a0d1d]/90 px-4 py-3">
      <div className="flex items-center gap-3">
        <button className="primary-button" onClick={onTranslate} disabled={isTranslating}>
          <Languages size={17} />
          {isTranslating ? "Translating" : "Translate Page"}
        </button>
        {isTranslating && (
          <button type="button" className="secondary-button border-rose-400/40 text-rose-200" onClick={onCancel}>
            <Square size={14} />
            Stop
          </button>
        )}
        <button
          type="button"
          className={instantTranslateMode ? "primary-button bg-violet hover:bg-violet/90" : "secondary-button"}
          onClick={onToggleInstantTranslateMode}
          title="Click a page section to translate it immediately"
        >
          <Zap size={16} />
          {instantTranslateMode ? "Quicking" : "Quick"}
        </button>
        <select className="field max-w-[170px]" value={sourceLanguage} onChange={(event) => onSourceLanguageChange(event.target.value)}>
          {LANGUAGE_OPTIONS.map((language) => (
            <option key={language.value} value={language.value}>
              {language.label}
            </option>
          ))}
        </select>
        <select className="field max-w-[170px]" value={targetLanguage} onChange={(event) => onTargetLanguageChange(event.target.value)}>
          {LANGUAGE_OPTIONS.filter((language) => language.value !== "auto").map((language) => (
            <option key={language.value} value={language.label}>
              {language.label}
            </option>
          ))}
        </select>
        <div className="min-w-0 flex-1">
          {progress && (
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                <div className="h-full bg-violet transition-all" style={{ width: `${percent}%` }} />
              </div>
              <span className="w-[210px] truncate">{progress.message}</span>
            </div>
          )}
          {error && <div className="truncate text-xs text-rose-300">{error}</div>}
        </div>
      </div>
    </section>
  );
}
