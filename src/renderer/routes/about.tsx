import { Sparkles } from "lucide-react";

export function AboutPage() {
  return (
    <section className="h-full overflow-auto p-8">
      <div className="glass max-w-3xl rounded-xl p-8">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#8ab4f8] text-[#202124]">
          <Sparkles size={26} />
        </div>
        <h1 className="text-3xl font-semibold text-[#e8eaed]">Mirrow</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#bdc1c6]">
          Mirrow is an AI-powered desktop browser that translates visible website text into Persian with a local LM Studio model while preserving the original page structure and layout.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-4">
          {[
            ["Platform", "Electron desktop app"],
            ["Renderer", "React, TypeScript, Vite"],
            ["Routing", "TanStack Router"],
            ["Async state", "TanStack Query"],
            ["Default online model", "openai/gpt-4.1-mini"],
            ["Default local endpoint", "http://localhost:1234/v1/chat/completions"],
            ["Default target", "Persian"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-[#3c4043] bg-[#202124] p-4">
              <div className="text-xs uppercase text-[#9aa0a6]">{label}</div>
              <div className="mt-1 text-sm text-[#e8eaed]">{value}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
