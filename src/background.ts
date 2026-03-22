import { ExtensionSettings, QuizRequestMessage, QuizResponseMessage } from "./shared/types";
import { generateQuizQuestions } from "./aiClient";

export const DEFAULT_SETTINGS_KEY = "settings";

async function getSettings(): Promise<ExtensionSettings | null> {
  console.log("youtube-quiz: getSettings called");
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS_KEY, (items) => {
      const settings = (items[DEFAULT_SETTINGS_KEY] as ExtensionSettings) ?? null;
      console.log("youtube-quiz: getSettings resolved");
      resolve(settings);
    });
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log("youtube-quiz: onMessage received, type =", message.type);
  if (message.type === "REQUEST_QUIZ") {
    void handleQuizRequest(message as QuizRequestMessage, sendResponse);
    return true; // keep channel open for async sendResponse
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
  const apiKey = settings?.geminiApiKey ?? "";
  const model = settings?.geminiModel ?? "gemini-3-flash-preview";
  console.log("youtube-quiz: model =", model, "| apiKey set =", apiKey.length > 0);

  try {
    console.log("youtube-quiz: calling generateQuizQuestions…");
    const questions = await generateQuizQuestions(req.transcript, req.numQuestions, apiKey, model);
    console.log("youtube-quiz: generated", questions.length, "question(s)");
    sendResponse({ type: "QUIZ_SUCCESS", questions });
  } catch (err) {
    console.error("youtube-quiz: generateQuizQuestions error", err);
    sendResponse({ type: "QUIZ_ERROR", error: String(err) });
  }
}
