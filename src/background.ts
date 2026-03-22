import { AIProvider, ExtensionSettings, QuizRequestMessage, QuizResponseMessage } from "./shared/types";
import { generateQuizQuestions } from "./aiClient";

export const DEFAULT_SETTINGS_KEY = "settings";

// Open the options page automatically on first install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    void chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
  }
});

const DEFAULT_PROVIDER: AIProvider = "gemini";
const DEFAULT_MODEL = "gemini-2.0-flash";

async function getSettings(): Promise<ExtensionSettings | null> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS_KEY, (items) => {
      const settings = (items[DEFAULT_SETTINGS_KEY] as ExtensionSettings) ?? null;
      resolve(settings);
    });
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "REQUEST_QUIZ") {
    void handleQuizRequest(message as QuizRequestMessage, sendResponse);
    return true;
  }
});

async function handleQuizRequest(
  req: QuizRequestMessage,
  sendResponse: (r: QuizResponseMessage) => void,
): Promise<void> {
  console.log(
    "youtube-quiz: handleQuizRequest | videoId =",
    req.videoId,
    "| numQuestions =",
    req.numQuestions,
    "| transcript chars =",
    req.transcript.length,
  );

  const settings = await getSettings();
  const provider: AIProvider = settings?.provider ?? DEFAULT_PROVIDER;
  const apiKey = settings?.apiKey ?? "";
  const model = settings?.model ?? DEFAULT_MODEL;
  console.log("youtube-quiz: provider =", provider, "| model =", model, "| apiKey set =", apiKey.length > 0);

  try {
    const questions = await generateQuizQuestions(req.transcript, req.numQuestions, apiKey, model, provider);
    console.log("youtube-quiz: generated", questions.length, "question(s)");
    sendResponse({ type: "QUIZ_SUCCESS", questions });
  } catch (err) {
    console.error("youtube-quiz: generateQuizQuestions error", err);
    sendResponse({ type: "QUIZ_ERROR", error: String(err) });
  }
}
