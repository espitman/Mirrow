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
    <section className="border-b border-[#3c4043] bg-[#202124] px-4 py-2.5">
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
          className={instantTranslateMode ? "primary-button" : "secondary-button"}
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
            <div className="flex items-center gap-3 text-xs text-[#9aa0a6]">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#3c4043]">
                <div className="h-full bg-[#8ab4f8] transition-all" style={{ width: `${percent}%` }} />
              </div>
              <span className="w-[210px] truncate">{progress.message}</span>
            </div>
          )}
          {error && <div className="truncate text-xs text-[#f28b82]">{error}</div>}
        </div>
      </div>
    </section>
  );
}
