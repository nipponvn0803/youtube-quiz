# Youtube Quiz Generator

A Chrome extension (Manifest V3) that pauses YouTube videos at configurable intervals and shows AI-generated multiple-choice quizzes based on the transcript up to that point — helping you stay engaged and retain what you watch.

## Features

- Automatically pauses videos and presents a quiz at a set interval (e.g. every 5 minutes)
- Questions are generated from the actual video transcript, covering only what you've watched so far
- Works out of the box with **Chrome's built-in on-device AI** (Gemini Nano) — no signup, no API key, nothing leaves your machine
- Also supports bringing your own key for **Google Gemini**, **OpenAI**, **Anthropic Claude**, **xAI Grok**, or **DeepSeek**, if you want a different model
- Configurable number of questions per quiz
- Questions are pre-generated 20 seconds before the quiz is due, so the dialog appears instantly
- Handles YouTube's SPA navigation — resets cleanly when you switch videos

## Installation

### Requirements

- Node.js (for building)
- Chrome 138 or later (for the built-in on-device AI; older Chrome or non-Chrome browsers will need a cloud provider API key instead)

### Build

```bash
npm install
npm run build      # one-time build → dist/
# or
npm run watch      # rebuild on file changes
```

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `dist/` folder

## Configuration

Open the extension's options page (click the extension icon → *Options*, or go to `chrome://extensions` → *Details* → *Extension options*).

| Setting | Description |
|---------|-------------|
| Provider | AI provider to use for generating questions — defaults to **On-device**, no key required |
| API key | Only shown for cloud providers; your key for the selected provider (stored locally via `chrome.storage`) |
| Model | Only shown for cloud providers; choose from models available for your API key |
| Quiz interval | How often to pause and quiz (in minutes of watch time) |
| Questions per quiz | Number of multiple-choice questions each time (1–10) |
| Quiz language | Language the questions and answers are written in. Defaults to **Auto**, which follows the transcript's language. On-device AI only supports English, Japanese, Spanish, German, and French — the rest are shown greyed out when that provider is selected. |

### Provider options

| Provider | Notes |
|----------|-------|
| On-device (default) | Chrome's built-in Gemini Nano model. No key, no signup, no network calls. Requires Chrome 138+; the options page shows a one-time model download with progress, and falls back to prompting for a cloud provider if unsupported. |
| Google Gemini | Free tier available with a Google account |
| OpenAI | Paid — requires an OpenAI account |
| Anthropic Claude | Paid — requires an Anthropic account |
| xAI Grok | Requires an xAI account |
| DeepSeek | Paid — requires a DeepSeek platform account |

For cloud providers, use the **Get a free API key →** link in the options page after selecting one.

## Architecture

### Source files (`src/`)

| File | Context | Purpose |
|------|---------|---------|
| `youtubeInterceptor.ts` | Content script — MAIN world | Patches `window.fetch` to intercept YouTube's transcript API and re-dispatches the payload as a `CustomEvent` |
| `youtubeQuizContent.ts` | Content script — isolated world | Main runtime: caches transcript, tracks video position, pre-generates questions, pauses video, renders quiz dialog |
| `background.ts` | Service worker | Receives `REQUEST_QUIZ` messages, reads settings, dispatches to the correct AI provider, returns results |
| `aiClient.ts` | Service worker | Builds the prompt and delegates to the selected provider module |
| `providers/` | Service worker | One module per provider (Gemini, OpenAI, Anthropic, Grok, DeepSeek, on-device) |
| `options.ts` | Options page | Reads/writes `ExtensionSettings` to `chrome.storage.sync`; drives the on-device availability/download UI |
| `shared/types.ts` | Shared | `QuizQuestion`, `ExtensionSettings`, and message types |
| `shared/quizLanguages.ts` | Shared | Selectable quiz languages, plus the subset Chrome's Prompt API supports |
| `shared/utils.ts` | Shared | `parseQuizQuestions` (JSON/markdown parser) and `sanitizeNumber` |
| `shared/ondeviceAvailability.ts` | Shared | Feature-detects and checks Chrome's `LanguageModel` API, and triggers the on-device model download |
| `shared/ondeviceTypes.d.ts` | Shared | Ambient type declarations for the `LanguageModel` global (Chrome's Prompt API) |

### Message flow

```
youtubeQuizContent (content script)
  → chrome.runtime.sendMessage(REQUEST_QUIZ)
    → background.ts (service worker)
      → aiClient → provider module → AI REST API
      ← QuizResponseMessage
  ← quiz dialog rendered in the DOM
```

## Development

```bash
npm run watch        # rebuild on every file change, then reload the extension in chrome://extensions
npm test             # run the test suite once
npm run test:watch   # run tests in watch mode
```

Tests live in `tests/` and cover all provider modules, the AI client dispatcher, and shared utilities.
