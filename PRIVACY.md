# Privacy Policy — YouTube Quiz Generator

**Last updated: March 22, 2026**

## Overview

YouTube Quiz Generator is a Chrome extension that pauses YouTube videos at set intervals and displays AI-generated quiz questions based on the video transcript. This policy explains what data the extension handles and how.

## Data Collected

### Video transcript text (Website content)
When a quiz is due, the extension reads the transcript of the YouTube video you are currently watching — up to the point you have watched so far — and sends that text to the AI provider you have selected in the extension settings.

This transcript text is:
- Used solely to generate quiz questions relevant to the video content
- Sent directly from your browser to the AI provider's API using your own API key
- Not stored, logged, or transmitted to any server operated by this extension or its developer

## Data NOT Collected

This extension does **not** collect, store, or transmit:
- Your name, email address, or any personally identifiable information
- Passwords or authentication credentials (your API key is stored locally on your device only — see below)
- Financial or payment information
- Health information
- Your location
- Your browsing history or the list of pages you visit
- Mouse movements, clicks, keystrokes, or any other user activity

## Local Storage

The extension stores the following data **locally on your device** using Chrome's built-in `chrome.storage.sync` API:
- Your selected AI provider
- Your API key for that provider
- Your preferred quiz interval (in minutes)
- Your preferred number of questions per quiz

This data is synced across your Chrome profile by Google if you have Chrome sync enabled, but it is never sent to or accessible by this extension's developer.

## Third-Party AI Providers

Transcript text is sent to whichever AI provider you configure:

| Provider | Privacy Policy |
|----------|----------------|
| Google Gemini | https://policies.google.com/privacy |
| OpenAI | https://openai.com/policies/privacy-policy |
| Anthropic Claude | https://www.anthropic.com/privacy |
| xAI Grok | https://x.ai/privacy-policy |

Each provider handles the data it receives according to its own privacy policy. Please review the policy of your chosen provider.

## Data Sharing

The developer of this extension does not receive, store, or share any data. There are no analytics, crash reporters, or tracking services included in this extension.

## Open Source

This extension is open source. You can inspect all code at:
**https://github.com/nipponvn0803/youtube-quiz**

## Changes to This Policy

If this policy changes, the updated version will be posted at this URL with a revised "Last updated" date.

## Contact

For questions or concerns, please open an issue at:
**https://github.com/nipponvn0803/youtube-quiz/issues**
