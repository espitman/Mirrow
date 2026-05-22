import { Eraser, Languages, MousePointer2 } from "lucide-react";
import { LANGUAGE_OPTIONS } from "../../shared/constants";
import type { TranslationProgress } from "../../shared/types";

type TranslateControlsProps = {
  sourceLanguage: string;
  targetLanguage: string;
  isTranslating: boolean;
  progress: TranslationProgress | null;
  error: string | null;
  exclusionMode: boolean;
  onSourceLanguageChange: (value: string) => void;
  onTargetLanguageChange: (value: string) => void;
  onTranslate: () => void;
  onToggleExclusionMode: () => void;
  onClearExclusions: () => void;
};

export function TranslateControls({
  sourceLanguage,
  targetLanguage,
  isTranslating,
  progress,
  error,
  exclusionMode,
  onSourceLanguageChange,
  onTargetLanguageChange,
  onTranslate,
  onToggleExclusionMode,
  onClearExclusions,
}: TranslateControlsProps) {
  const percent = progress ? Math.round((progress.completed / Math.max(progress.total, 1)) * 100) : 0;

  return (
    <section className="border-b border-white/10 bg-[#0a0d1d]/90 px-4 py-3">
      <div className="flex items-center gap-3">
        <button className="primary-button" onClick={onTranslate} disabled={isTranslating}>
          <Languages size={17} />
          {isTranslating ? "Translating" : "Translate Page"}
        </button>
        <button
          type="button"
          className={exclusionMode ? "primary-button bg-rose-500 hover:bg-rose-500/90" : "secondary-button"}
          onClick={onToggleExclusionMode}
          title="Click page elements to exclude them from translation"
        >
          <MousePointer2 size={16} />
          {exclusionMode ? "Selecting" : "Exclude"}
        </button>
        <button type="button" className="icon-button" onClick={onClearExclusions} title="Clear excluded elements">
          <Eraser size={16} />
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
