# YouTube Quiz Tutor

A Chrome extension (Manifest V3) that pauses YouTube videos at configurable intervals and shows AI-generated multiple-choice quizzes based on the transcript up to that point — helping you stay engaged and retain what you watch.

## Features

- Automatically pauses videos and presents a quiz at a set interval (e.g. every 5 minutes)
- Questions are generated from the actual video transcript, covering only what you've watched so far
- Supports multiple AI providers: **Google Gemini**, **OpenAI**, **Anthropic Claude**, and **xAI Grok**
- Configurable number of questions per quiz
- Questions are pre-generated 20 seconds before the quiz is due, so the dialog appears instantly
- Handles YouTube's SPA navigation — resets cleanly when you switch videos

## Installation

### Requirements

- Node.js (for building)
- A Chrome-based browser
- An API key for one of the supported AI providers

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
| Provider | AI provider to use for generating questions |
| API key | Your key for the selected provider (stored locally via `chrome.storage`) |
| Model | Choose from models available for your API key |
| Quiz interval | How often to pause and quiz (in minutes of watch time) |
| Questions per quiz | Number of multiple-choice questions each time (1–10) |

### Getting an API key

| Provider | Notes |
|----------|-------|
| Google Gemini | Free tier available with a Google account |
| OpenAI | Paid — requires an OpenAI account |
| Anthropic Claude | Paid — requires an Anthropic account |
| xAI Grok | Requires an xAI account |

Use the **Get a free API key →** link in the options page after selecting a provider.

## Architecture

### Source files (`src/`)

| File | Context | Purpose |
|------|---------|---------|
| `youtubeInterceptor.ts` | Content script — MAIN world | Patches `window.fetch` to intercept YouTube's transcript API and re-dispatches the payload as a `CustomEvent` |
| `youtubeQuizContent.ts` | Content script — isolated world | Main runtime: caches transcript, tracks video position, pre-generates questions, pauses video, renders quiz dialog |
| `background.ts` | Service worker | Receives `REQUEST_QUIZ` messages, reads settings, dispatches to the correct AI provider, returns results |
| `aiClient.ts` | Service worker | Builds the prompt and delegates to the selected provider module |
| `providers/` | Service worker | One module per provider (Gemini, OpenAI, Anthropic, Grok) |
| `options.ts` | Options page | Reads/writes `ExtensionSettings` to `chrome.storage.sync` |
| `shared/types.ts` | Shared | `QuizQuestion`, `ExtensionSettings`, and message types |

### Message flow

```
youtubeQuizContent (content script)
  → chrome.runtime.sendMessage(REQUEST_QUIZ)
    → background.ts (service worker)
      → aiClient → provider module → AI REST API
      ← QuizResponseMessage
  ← quiz dialog rendered in the DOM
```

### Key design notes

- **Two-world split**: `youtubeInterceptor.ts` runs in `"world": "MAIN"` to patch `window.fetch`. It communicates back to the isolated world only via `CustomEvent` on `window` — the only cross-world boundary available in MV3.
- **Pre-generation**: Questions are generated 20 s before the scheduled quiz so the overlay appears without delay.
- **SPA navigation**: The content script listens for `yt-navigate-finish` and resets all state on each `/watch` navigation.

## Development

```bash
npm run watch   # rebuild on every file change, then reload the extension in chrome://extensions
```

There are no automated tests configured at this time.
