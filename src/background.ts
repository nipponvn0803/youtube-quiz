import { ExtensionSettings, QuizRequestMessage, QuizResponseMessage } from "./shared/types";
import { generateQuizQuestions } from "./aiClient";

export const DEFAULT_SETTINGS_KEY = "settings";

const ALARM_NAME = "pauseVideo";
const DEFAULT_INTERVAL_MINUTES = 0.1;

async function getSettings(): Promise<ExtensionSettings | null> {
  console.log("youtube-quiz: getSettings called");
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS_KEY, (items) => {
      const settings = (items[DEFAULT_SETTINGS_KEY] as ExtensionSettings) ?? null;
      console.log("youtube-quiz: getSettings resolved", settings);
      resolve(settings);
    });
  });
}

async function scheduleAlarm(): Promise<void> {
  console.log("youtube-quiz: scheduleAlarm called");
  const settings = await getSettings();
  const intervalMinutes = settings?.quizIntervalMinutes ?? DEFAULT_INTERVAL_MINUTES;
  console.log("youtube-quiz: scheduleAlarm interval =", intervalMinutes, "min");

  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: intervalMinutes });
  console.log("youtube-quiz: alarm created");
}

async function pauseYouTubeTabs(): Promise<void> {
  console.log("youtube-quiz: pauseYouTubeTabs called");
  const tabs = await chrome.tabs.query({ url: "https://www.youtube.com/watch*" });
  console.log("youtube-quiz: found", tabs.length, "YouTube tab(s)");

  for (const tab of tabs) {
    if (tab.id != null) {
      console.log("youtube-quiz: sending PAUSE_VIDEO to tab", tab.id, tab.url);
      chrome.tabs
        .sendMessage(tab.id, { type: "PAUSE_VIDEO" })
        .catch((err) => console.warn("youtube-quiz: sendMessage failed for tab", tab.id, err));
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("youtube-quiz: onInstalled fired");
  void scheduleAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  console.log("youtube-quiz: onStartup fired");
  void scheduleAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  console.log("youtube-quiz: onAlarm fired, name =", alarm.name);
  if (alarm.name === ALARM_NAME) {
    void pauseYouTubeTabs();
  }
});

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
  console.log("youtube-quiz: handleQuizRequest called, videoId =", req.videoId, "numQuestions =", req.numQuestions);
  console.log("youtube-quiz: transcript length =", req.transcript.length, "chars");

  const settings = await getSettings();
  const apiKey = settings?.geminiApiKey ?? "";
  const model = settings?.geminiModel ?? "gemini-3-flash-preview";
  console.log("youtube-quiz: using model =", model, "| apiKey set =", apiKey.length > 0);

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

chrome.storage.onChanged.addListener((changes) => {
  console.log("youtube-quiz: storage changed, keys =", Object.keys(changes));
  if (DEFAULT_SETTINGS_KEY in changes) {
    console.log("youtube-quiz: settings changed, rescheduling alarm");
    void scheduleAlarm();
  }
});
