import { Sparkles } from "lucide-react";

export function AboutPage() {
  return (
    <section className="h-full overflow-auto p-8">
      <div className="glass max-w-3xl rounded-xl p-8">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-violet text-white shadow-glow">
          <Sparkles size={26} />
        </div>
        <h1 className="text-3xl font-semibold text-white">Mirrow</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
          Mirrow is an AI-powered desktop browser that translates visible website text into Persian with a local LM Studio model while preserving the original page structure and layout.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-4">
          {[
            ["Platform", "Electron desktop app"],
            ["Renderer", "React, TypeScript, Vite"],
            ["Routing", "TanStack Router"],
            ["Async state", "TanStack Query"],
            ["Default online model", "openai/gpt-4.1-mini"],
            ["Default local model", "translategemma-4b-it"],
            ["Default target", "Persian"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <div className="text-xs uppercase text-slate-500">{label}</div>
              <div className="mt-1 text-sm text-white">{value}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
