import type { ExtensionSettings, QuizRequestMessage, QuizResponseMessage } from "./shared/types";
import { callOpenAIForQuestions } from "./aiClient";

declare const chrome: any;

const DEFAULT_SETTINGS: ExtensionSettings = {
  openaiApiKey: "",
  openaiModel: "gpt-4.1-mini",
  quizIntervalMinutes: 5,
  quizNumQuestions: 3,
  quizAutoEnabled: true,
};

function loadSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items: ExtensionSettings) => {
      resolve(items);
    });
  });
}

async function handleQuizRequest(message: QuizRequestMessage): Promise<QuizResponseMessage> {
  const settings = await loadSettings();

  // For the MVP we don't implement a full transcript fetcher here, but this is
  // where it would go. To keep things working end-to-end, we rely on title
  // only and an empty transcript snippet.
  //
  // In a future iteration, you can:
  //   - Use the YouTube Data API or unofficial transcript endpoints to fetch captions.
  //   - Pass the actual transcript snippet instead of an empty string.

  const tabId = typeof message.tabId === "number" ? message.tabId : undefined;
  const tab = tabId !== undefined ? await chrome.tabs.get(tabId).catch(() => null) : null;
  const title = tab?.title ?? "";

  const transcriptSnippet = "";

  const questions = await callOpenAIForQuestions({
    settings,
    transcriptSnippet,
    title,
    currentTimeSeconds: message.currentTimeSeconds,
    numQuestions: message.numQuestions,
  });

  return {
    type: "QUIZ_SUCCESS",
    questions,
  };
}

chrome.runtime.onMessage.addListener((rawMessage: unknown, sender: unknown, sendResponse: (response: QuizResponseMessage) => void) => {
  const message = rawMessage as QuizRequestMessage;

  if (message && message.type === "REQUEST_QUIZ") {
    (async () => {
      try {
        const response = await handleQuizRequest({
          ...message,
          // Attach tabId so we can look up title in the handler.
          // TypeScript will complain if we strictly type this; for now we treat it loosely.
        } as any);
        sendResponse(response);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        const errorResponse: QuizResponseMessage = {
          type: "QUIZ_ERROR",
          error: errorMsg,
        };
        sendResponse(errorResponse);
      }
    })();

    return true; // Keep the message channel open for async response.
  }

  return undefined;
});

