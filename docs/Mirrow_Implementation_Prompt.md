# Mirrow — AI Web Translator Desktop App

## Goal

Build a production-quality Electron desktop app called **Mirrow**.

Mirrow is an AI-powered desktop browser that loads any website, extracts visible text from the page, sends it to a local LM Studio model, translates it into Persian, and replaces only the text nodes in the original page.

The original website layout, CSS, images, links, structure, spacing, and interactions must remain untouched.

---

## Product Summary

**App name:** Mirrow  
**Platform:** Desktop  
**Core concept:** AI web translator browser  
**Primary translation engine:** Local LM Studio model  
**Default model:** `translategemma-4b-it`  
**Default target language:** Persian  
**Main user action:** Enter URL → Load page → Click Translate Page → Page text becomes Persian while layout stays the same.

---

## Tech Stack

Use:

- Electron
- React
- TypeScript
- Vite
- Tailwind CSS
- TanStack Router
- TanStack Query
- TanStack Router Devtools
- Electron IPC
- Local storage or file-based persistence for settings/history

Install required packages:

```bash
npm install @tanstack/react-router @tanstack/react-query @tanstack/router-devtools
```

---

## Local AI API

Use LM Studio's OpenAI-compatible local API.

Default config:

```txt
Base URL: http://localhost:1234/v1/chat/completions
Model: translategemma-4b-it
Temperature: 0.2
```

The app must actually call LM Studio. Do not create a mock-only implementation.

---

## Main Features

### 1. Desktop Browser

The app should include an embedded browser area that can load external websites.

Use either:

- Electron `BrowserView`, preferred for a more native browser experience
- Or Electron `webview`, if simpler for implementation

The user should be able to:

- Enter a URL
- Load the page
- Go back
- Go forward
- Reload
- Translate the current page

---

### 2. Layout-Preserving Translation

When the user clicks **Translate Page**, the app must:

1. Inject a DOM extraction script into the loaded webpage.
2. Collect only visible text nodes.
3. Exclude hidden, irrelevant, or unsafe elements.
4. Send the text nodes to the Electron main process in batches.
5. Translate each batch using LM Studio.
6. Return translated text mapped by stable IDs.
7. Replace only `node.textContent`.
8. Never rewrite the full HTML.
9. Preserve all DOM structure, CSS, attributes, links, images, videos, forms, and layout.

Important rule:

```ts
node.textContent = translatedText;
```

Do not use:

```ts
document.body.innerHTML = translatedHtml;
```

---

## UI Requirements

Create a polished dark-mode desktop interface.

Visual style:

- Premium dark UI
- Glassmorphism panels
- Purple accent color
- Rounded corners
- Subtle shadows
- Clean typography
- macOS-inspired window controls
- Modern browser-like layout
- Professional SaaS/product feel

Main layout:

```txt
┌───────────────────────────────────────────────┐
│ Mirrow Desktop App                            │
├───────────────┬───────────────────────────────┤
│ Sidebar       │ Browser Header / URL Bar      │
│               ├───────────────────────────────┤
│ Translate     │ Translate Controls            │
│ History       ├───────────────────────────────┤
│ Settings      │ Embedded Website View         │
│ About         │                               │
└───────────────┴───────────────────────────────┘
```

---

## Sidebar

The sidebar should include:

- Mirrow logo area
- App name: `Mirrow`
- Subtitle: `AI Web Translator`
- Navigation items:
  - Translate
  - History
  - Settings
  - About
- Translation engine card:
  - Model name: `translategemma-4b-it`
  - Provider: `LM Studio (Local)`
  - Status: Connected / Offline
  - Button: Change Model
- Theme section:
  - System
  - Light
  - Dark
- Small brand card:
  - `Mirrow`
  - `See the world in your language.`

---

## Main Translate Screen

The main screen should include:

### Browser toolbar

- Back button
- Forward button
- Reload button
- URL input
- Favorite/star icon placeholder
- Security/shield icon placeholder
- Menu icon placeholder

### Translation controls

- `Translate Page` button
- Source language dropdown:
  - Default: `Auto Detect`
- Target language dropdown:
  - Default: `Persian`
- Progress/loading state
- Error state if translation fails

---

## Routes

Use **TanStack Router**.

Required routes:

```txt
/
 /translate
 /history
 /settings
 /about
```

Behavior:

- `/` should redirect to `/translate`.
- `/translate` shows the browser and translation controls.
- `/history` shows previous translated URLs.
- `/settings` shows model/API/batch settings.
- `/about` shows app information.

---

## TanStack Query Requirements

Use **TanStack Query** for async operations.

Use queries for:

- Checking LM Studio connection
- Loading settings
- Loading translation history

Use mutations for:

- Updating settings
- Translating batches
- Adding a history item
- Clearing history

Renderer should call preload-safe IPC APIs. TanStack Query should wrap those IPC calls.

Example:

```ts
const translateBatchMutation = useMutation({
  mutationFn: (batch: TranslationBatch) =>
    window.mirrow.translateBatch(batch),
});
```

---

## Electron IPC Boundary

The renderer must not directly access Node APIs.

Expose safe APIs through preload.

Required IPC channels:

```txt
browser:load-url
browser:go-back
browser:go-forward
browser:reload

translate:start
translate:batch
translate:progress
translate:error
translate:complete

settings:get
settings:update

history:get
history:add
history:clear

lmstudio:check-connection
```

---

## Suggested Project Structure

```txt
src/
  main/
    main.ts
    ipc.ts
    browser.ts
    translator.ts
    settings.ts
    history.ts

  preload/
    preload.ts

  renderer/
    main.tsx
    App.tsx

    routes/
      __root.tsx
      index.tsx
      translate.tsx
      history.tsx
      settings.tsx
      about.tsx

    components/
      Sidebar.tsx
      BrowserShell.tsx
      BrowserToolbar.tsx
      TranslateControls.tsx
      SettingsPanel.tsx
      HistoryPanel.tsx
      StatusBadge.tsx

    lib/
      queryClient.ts
      ipcClient.ts

    styles/
      globals.css

  shared/
    types.ts
    constants.ts
```

---

## Shared Types

Create strong TypeScript types.

```ts
export type LanguageCode = "auto" | "fa" | "en" | "ar" | "tr" | "fr" | "de";

export type TranslationItem = {
  id: string;
  text: string;
};

export type TranslationResultItem = {
  id: string;
  translation: string;
};

export type TranslationBatch = {
  targetLanguage: string;
  sourceLanguage?: string;
  items: TranslationItem[];
};

export type TranslationBatchResult = {
  items: TranslationResultItem[];
};

export type AppSettings = {
  lmStudioBaseUrl: string;
  modelName: string;
  temperature: number;
  batchSize: number;
  defaultTargetLanguage: string;
};

export type HistoryItem = {
  id: string;
  url: string;
  title?: string;
  targetLanguage: string;
  translatedAt: string;
};
```

---

## Default Settings

```ts
export const DEFAULT_SETTINGS: AppSettings = {
  lmStudioBaseUrl: "http://localhost:1234/v1/chat/completions",
  modelName: "translategemma-4b-it",
  temperature: 0.2,
  batchSize: 20,
  defaultTargetLanguage: "Persian",
};
```

---

## DOM Extraction Script

Inject a script into the web page when the user clicks Translate.

The script should:

- Walk `document.body` using `TreeWalker`
- Collect visible text nodes
- Skip irrelevant tags
- Skip whitespace-only text
- Skip very short meaningless text when appropriate
- Assign stable IDs
- Store node references in a map
- Return `{ id, text }[]`
- Later receive `{ id, translation }[]`
- Replace the matching text nodes

Example logic:

```ts
function isVisibleElement(el: Element): boolean {
  const style = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();

  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0" &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function shouldSkipElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase();

  return [
    "script",
    "style",
    "noscript",
    "svg",
    "canvas",
    "input",
    "textarea",
    "code",
    "pre",
    "iframe"
  ].includes(tag);
}

function collectVisibleTextNodes(): TranslationItem[] {
  const items: TranslationItem[] = [];
  const nodeMap = new Map<string, Text>();
  let counter = 0;

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const text = node.textContent?.trim();

        if (!text) return NodeFilter.FILTER_REJECT;

        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        if (shouldSkipElement(parent)) return NodeFilter.FILTER_REJECT;
        if (!isVisibleElement(parent)) return NodeFilter.FILTER_REJECT;

        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const text = node.textContent?.trim();

    if (!text) continue;

    const id = `t_${counter++}`;

    nodeMap.set(id, node);
    items.push({ id, text });
  }

  (window as any).__mirrowNodeMap = nodeMap;

  return items;
}

function applyTranslations(translations: TranslationResultItem[]) {
  const nodeMap = (window as any).__mirrowNodeMap as Map<string, Text>;

  if (!nodeMap) return;

  for (const item of translations) {
    const node = nodeMap.get(item.id);
    if (node && item.translation) {
      node.textContent = item.translation;
    }
  }
}
```

Adapt this code as needed for Electron injection.

---

## Translation Prompt

Use this exact prompt style for every batch.

### System message

```txt
You are a precise website translation engine. Translate the provided visible website text into natural Persian. Preserve meaning, tone, numbers, punctuation, brand names, product names, URLs, placeholders, and formatting intent. Return only valid JSON. Do not add explanations.
```

### User payload

```json
{
  "targetLanguage": "Persian",
  "items": [
    {
      "id": "t1",
      "text": "Original text"
    },
    {
      "id": "t2",
      "text": "Another text"
    }
  ]
}
```

### Expected response

```json
{
  "items": [
    {
      "id": "t1",
      "translation": "..."
    },
    {
      "id": "t2",
      "translation": "..."
    }
  ]
}
```

---

## LM Studio Translator Implementation

Create `translator.ts`.

Requirements:

- Accept `TranslationBatch`
- Call LM Studio chat completions endpoint
- Use model from settings
- Use base URL from settings
- Use temperature from settings
- Parse JSON safely
- Return translations by ID
- Handle malformed JSON
- Handle network errors
- Handle offline LM Studio
- Never crash the app

Pseudo-code:

```ts
export async function translateBatch(
  batch: TranslationBatch,
  settings: AppSettings
): Promise<TranslationBatchResult> {
  const response = await fetch(settings.lmStudioBaseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: settings.modelName,
      temperature: settings.temperature,
      messages: [
        {
          role: "system",
          content:
            "You are a precise website translation engine. Translate the provided visible website text into natural Persian. Preserve meaning, tone, numbers, punctuation, brand names, product names, URLs, placeholders, and formatting intent. Return only valid JSON. Do not add explanations.",
        },
        {
          role: "user",
          content: JSON.stringify(batch),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`LM Studio error: ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Empty response from LM Studio");
  }

  return parseTranslationJson(content);
}
```

---

## JSON Parsing / Repair

The model may return malformed JSON.

Implement a safe parser:

1. Try `JSON.parse`.
2. If it fails, extract the first JSON object from the text.
3. Try parsing again.
4. If it still fails, throw a readable error.
5. Do not execute any returned text as code.

```ts
export function parseTranslationJson(raw: string): TranslationBatchResult {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("Model did not return JSON");
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      throw new Error("Could not parse translation JSON");
    }
  }
}
```

---

## Batching

Split collected text nodes into batches.

Default batch size: `20`

Rules:

- Keep IDs stable
- Process batches sequentially or with low concurrency
- Update progress after each batch
- Apply translations batch by batch
- If one batch fails, show an error but do not destroy previous successful translations

Progress example:

```txt
Translating 40 / 180 text nodes
```

---

## History

Store translation history.

Each history item:

```ts
{
  id: string;
  url: string;
  title?: string;
  targetLanguage: "Persian";
  translatedAt: "ISO date string";
}
```

History screen should show:

- URL
- Page title if available
- Target language
- Date/time
- Button to open again
- Button to clear all history

Use TanStack Query for reading and mutating history.

---

## Settings Screen

Settings should include:

- LM Studio base URL
- Model name
- Temperature
- Batch size
- Default target language
- Connection status
- Test connection button

Use TanStack Query for loading settings and mutations for saving settings.

Settings should persist across app restarts.

---

## Error Handling

Handle these states:

- LM Studio offline
- Invalid LM Studio URL
- Model not loaded
- Translation JSON parse failure
- Website failed to load
- Page blocks injection
- No visible text found
- Empty translation response
- Partial batch failure

Show user-friendly messages.

Examples:

```txt
LM Studio is offline. Please start LM Studio and load the translategemma-4b-it model.
```

```txt
No visible text was found on this page.
```

```txt
Some parts of the page could not be translated.
```

---

## Security Requirements

Electron security must be handled correctly.

Use:

```ts
contextIsolation: true
nodeIntegration: false
sandbox: true
```

Expose only necessary APIs through preload.

Do not expose raw `ipcRenderer`.

Validate IPC inputs in the main process.

Do not allow arbitrary code execution.

Do not inject untrusted code from model responses.

---

## Preload API

Expose a safe API:

```ts
contextBridge.exposeInMainWorld("mirrow", {
  browser: {
    loadUrl: (url: string) => ipcRenderer.invoke("browser:load-url", url),
    goBack: () => ipcRenderer.invoke("browser:go-back"),
    goForward: () => ipcRenderer.invoke("browser:go-forward"),
    reload: () => ipcRenderer.invoke("browser:reload"),
  },

  translation: {
    start: (options: TranslatePageOptions) =>
      ipcRenderer.invoke("translate:start", options),
    translateBatch: (batch: TranslationBatch) =>
      ipcRenderer.invoke("translate:batch", batch),
  },

  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    update: (settings: Partial<AppSettings>) =>
      ipcRenderer.invoke("settings:update", settings),
  },

  history: {
    get: () => ipcRenderer.invoke("history:get"),
    add: (item: HistoryItem) => ipcRenderer.invoke("history:add", item),
    clear: () => ipcRenderer.invoke("history:clear"),
  },

  lmStudio: {
    checkConnection: () => ipcRenderer.invoke("lmstudio:check-connection"),
  },
});
```

Add TypeScript global declarations for `window.mirrow`.

---

## TanStack Query Examples

### Query client

```ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
    },
  },
});
```

### Settings query

```ts
export function useSettingsQuery() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => window.mirrow.settings.get(),
  });
}
```

### Update settings mutation

```ts
export function useUpdateSettingsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: Partial<AppSettings>) =>
      window.mirrow.settings.update(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}
```

### LM Studio status query

```ts
export function useLmStudioStatusQuery() {
  return useQuery({
    queryKey: ["lmstudio-status"],
    queryFn: () => window.mirrow.lmStudio.checkConnection(),
    refetchInterval: 5000,
  });
}
```

---

## TanStack Router Setup

Create route tree with:

```txt
__root.tsx
index.tsx
translate.tsx
history.tsx
settings.tsx
about.tsx
```

Root layout should include the sidebar and main outlet.

Example:

```tsx
import { Outlet, createRootRoute } from "@tanstack/react-router";
import { Sidebar } from "../components/Sidebar";

export const Route = createRootRoute({
  component: () => (
    <div className="flex h-screen bg-[#070816] text-white">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  ),
});
```

---

## Acceptance Criteria

The implementation is complete when:

- App runs with `npm install` and `npm run dev`
- Electron window opens successfully
- UI is polished and dark-mode by default
- User can enter a URL and load a website
- Back, forward, and reload controls work
- Clicking Translate Page extracts visible text nodes
- Text batches are sent to LM Studio
- LM Studio response is parsed
- Text nodes are replaced in-place
- Original website layout is preserved
- Translation history is saved
- Settings are editable and persisted
- LM Studio offline state is handled
- TypeScript has no major errors
- README explains setup and usage

---

## README Requirements

Create a clear README with:

- What Mirrow is
- Features
- Tech stack
- Requirements
- LM Studio setup
- How to run
- How translation works
- Known limitations
- Future improvements

Include this LM Studio setup:

```txt
1. Open LM Studio.
2. Load the model: translategemma-4b-it.
3. Start the local server.
4. Confirm the server is available at:
   http://localhost:1234/v1/chat/completions
5. Run Mirrow.
```

---

## Known Limitations

Document these clearly:

- Some websites may block script injection.
- Dynamic SPAs may need re-translation after route changes.
- Very large pages may take time to translate.
- Local model quality depends on the selected LM Studio model.
- Replacing English text with Persian may slightly affect text wrapping.
- Shadow DOM content may not be translated in the first version.

---

## Future Improvements

Prepare the codebase so these can be added later:

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

---

## Final Instruction

Build the app as a real working Electron + React + TypeScript project.

Focus on:

- Clean architecture
- Working local LM Studio translation
- Safe Electron IPC
- High-quality UI
- Layout-preserving DOM translation
- TanStack Router and TanStack Query integration

Do not leave the core translation flow as a placeholder.
