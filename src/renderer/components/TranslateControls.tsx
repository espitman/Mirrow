import { ChevronDown, Languages, Square, Zap } from "lucide-react";
import { LANGUAGE_OPTIONS } from "../../shared/constants";
import type { TranslationProgress } from "../../shared/types";

export type TranslateControlsProps = {
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
  variant?: "bar" | "sidebar";
  compact?: boolean;
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
  variant = "bar",
  compact = false,
}: TranslateControlsProps) {
  const percent = progress ? Math.round((progress.completed / Math.max(progress.total, 1)) * 100) : 0;

  if (variant === "sidebar") {
    if (compact) {
      return (
        <div className="no-drag mt-4 grid gap-2">
          <button
            type="button"
            className="flex h-10 w-full items-center justify-center rounded-full bg-[#8ab4f8] text-[#202124] transition hover:bg-[#aecbfa] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onTranslate}
            disabled={isTranslating}
            title={isTranslating ? "Translating" : "Translate Page"}
          >
            <Languages size={18} />
          </button>
          <button
            type="button"
            className={`flex h-10 w-full items-center justify-center rounded-full border border-[#5f6368]/70 transition ${
              instantTranslateMode
                ? "bg-[#8ab4f8] text-[#202124]"
                : "bg-transparent text-[#bdc1c6] hover:bg-white/[0.08] hover:text-[#e8eaed]"
            }`}
            onClick={onToggleInstantTranslateMode}
            title="Quick translate"
          >
            <Zap size={18} />
          </button>
          {isTranslating && (
            <button
              type="button"
              className="flex h-10 w-full items-center justify-center rounded-full border border-rose-400/40 text-rose-200 transition hover:bg-white/[0.08]"
              onClick={onCancel}
              title="Stop translation"
            >
              <Square size={16} />
            </button>
          )}
        </div>
      );
    }

    return (
      <section className="rounded-xl border border-[#3c4043] bg-[#292a2d] p-4">
        <div className="mb-3 text-xs uppercase text-[#9aa0a6]">Translation</div>
        <div className="grid gap-2">
          <button className="primary-button w-full" onClick={onTranslate} disabled={isTranslating}>
            <Languages size={17} />
            {isTranslating ? "Translating" : "Translate Page"}
          </button>
          {isTranslating && (
            <button type="button" className="secondary-button w-full border-rose-400/40 text-rose-200" onClick={onCancel}>
              <Square size={14} />
              Stop
            </button>
          )}
          <button
            type="button"
            className={`${instantTranslateMode ? "primary-button" : "secondary-button"} w-full`}
            onClick={onToggleInstantTranslateMode}
            title="Click a page section to translate it immediately"
          >
            <Zap size={16} />
            {instantTranslateMode ? "Quicking" : "Quick"}
          </button>
        </div>
        <label className="mt-3 block">
          <span className="mb-1.5 block text-xs uppercase text-[#9aa0a6]">Source</span>
          <div className="relative">
            <select
              className="field h-9 appearance-none pr-10 text-xs"
              value={sourceLanguage}
              onChange={(event) => onSourceLanguageChange(event.target.value)}
            >
              {LANGUAGE_OPTIONS.map((language) => (
                <option key={language.value} value={language.value}>
                  {language.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#bdc1c6]" size={16} />
          </div>
        </label>
        <label className="mt-3 block">
          <span className="mb-1.5 block text-xs uppercase text-[#9aa0a6]">Target</span>
          <div className="relative">
            <select
              className="field h-9 appearance-none pr-10 text-xs"
              value={targetLanguage}
              onChange={(event) => onTargetLanguageChange(event.target.value)}
            >
              {LANGUAGE_OPTIONS.filter((language) => language.value !== "auto").map((language) => (
                <option key={language.value} value={language.label}>
                  {language.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#bdc1c6]" size={16} />
          </div>
        </label>
        {(progress || error) && (
          <div className="mt-3">
            {progress && (
              <div className="text-xs text-[#9aa0a6]">
                <div className="h-1.5 overflow-hidden rounded-full bg-[#3c4043]">
                  <div className="h-full bg-[#8ab4f8] transition-all" style={{ width: `${percent}%` }} />
                </div>
                <div className="mt-2 truncate">{progress.message}</div>
              </div>
            )}
            {error && <div className="truncate text-xs text-[#f28b82]">{error}</div>}
          </div>
        )}
      </section>
    );
  }

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
