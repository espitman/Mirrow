# Mirrow

Mirrow is an AI-powered Electron desktop browser that translates visible website text into Persian using a local LM Studio model. It preserves the original page layout by replacing only text node content.

## Features

- Embedded desktop browser with URL entry, back, forward, and reload controls
- Layout-preserving page translation through injected DOM text-node extraction
- Local LM Studio translation through the OpenAI-compatible chat completions API
- Batch translation with progress, partial failure handling, and safe JSON parsing
- Dark premium desktop UI with Translate, History, Settings, and About routes
- Settings and translation history persisted across app restarts
- Safe Electron preload APIs with `contextIsolation`, `nodeIntegration: false`, and sandboxing

## Tech Stack

- Electron
- React
- TypeScript
- Vite
- Tailwind CSS
- TanStack Router
- TanStack Query
- Electron IPC

## Requirements

- Node.js `v22.12.0`
- pnpm
- LM Studio with a loaded local translation model

Use the project Node version before installing or running:

```bash
nvm use v22.12.0
```

## LM Studio Setup

1. Open LM Studio.
2. Load the model: `translategemma-4b-it`.
3. Start the local server.
4. Confirm the server is available at:
   `http://localhost:1234/v1/chat/completions`
5. Run Mirrow.

Default app settings now support both online and local engines. Online mode is compatible with Liara's OpenAI-compatible Chat API.

```txt
Online base URL: https://ai.liara.ir/api/6a0ccd2d298429714a4b3e25/v1
Online model: openai/gpt-4.1-mini
Local base URL: http://localhost:1234/v1/chat/completions
Local model: translategemma-4b-it
Temperature: 0.2
Batch size: 20
Target language: Persian
```

If the online API key field is empty on macOS, Mirrow attempts to reuse Mirook's Keychain API key (`com.espitman.Mirook` / `openai-api-key`).

## How To Run

```bash
nvm use v22.12.0
pnpm install
pnpm dev
```

For a production build:

```bash
nvm use v22.12.0
pnpm build
```

## How Translation Works

When you click **Translate Page**, Mirrow asks the Electron main process to inject a script into the current BrowserView page. That script walks `document.body` with a `TreeWalker`, collects visible text nodes, assigns stable IDs, and stores node references in a page-local map.

The main process sends the collected text to LM Studio in batches. Each model response is parsed as JSON and applied back to the original page with:

```ts
node.textContent = translatedText;
```

Mirrow never rewrites `document.body.innerHTML`, so page structure, links, images, styles, and interaction handlers are left intact.

## Known Limitations

- Some websites may block script injection.
- Dynamic SPAs may need re-translation after route changes.
- Very large pages may take time to translate.
- Local model quality depends on the selected LM Studio model.
- Replacing English text with Persian may slightly affect text wrapping.
- Shadow DOM content is not translated in the first version.

## Future Improvements

- Auto-translate after page load
- Translate selected text
- Bilingual hover mode
- Per-site translation preferences
- Translation cache
- OCR for images
- PDF translation
- Multi-language support
- Better RTL handling
- Reader mode
- Extension-like mode
- Custom prompts
- Model selector
