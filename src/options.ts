import { DEFAULT_SETTINGS_KEY } from "./background";
import { ExtensionSettings } from "./shared/types";

const DEFAULT_SETTINGS: ExtensionSettings = {
  geminiApiKey: "",
  geminiModel: "gemini-3-flash-preview",
  quizIntervalMinutes: 5,
  quizNumQuestions: 3,
  quizAutoEnabled: true,
};

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing element with id="${id}"`);
  }
  return el;
}

function getInputs() {
  return {
    apiKeyInput: $("gemini-api-key") as HTMLInputElement,
    modelInput: $("gemini-model") as HTMLInputElement,
    quizIntervalInput: $("quiz-interval-minutes") as HTMLInputElement,
    quizNumQuestionsInput: $("quiz-num-questions") as HTMLInputElement,
    quizAutoEnabledInput: $("quiz-auto-enabled") as HTMLInputElement,
    saveButton: $("save-button") as HTMLButtonElement,
    statusEl: $("status") as HTMLSpanElement,
  };
}

function setStatus(
  message: string,
  kind: "ok" | "error" | "neutral" = "neutral",
) {
  const { statusEl } = getInputs();
  statusEl.textContent = message;
  statusEl.classList.remove("ok", "error");
  if (kind === "ok") statusEl.classList.add("ok");
  if (kind === "error") statusEl.classList.add("error");
}

function sanitizeNumber(
  raw: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

async function loadSettings() {
  const {
    apiKeyInput,
    modelInput,
    quizIntervalInput,
    quizNumQuestionsInput,
    quizAutoEnabledInput,
  } = getInputs();

  return new Promise<void>((resolve) => {
    chrome.storage.sync.get(
      DEFAULT_SETTINGS_KEY,
      (items: { [key: string]: unknown }) => {
        const settings = (items[DEFAULT_SETTINGS_KEY] ?? {}) as ExtensionSettings;
        apiKeyInput.value = settings.geminiApiKey ?? "";
        modelInput.value = settings.geminiModel || DEFAULT_SETTINGS.geminiModel;
        quizIntervalInput.value = String(
          settings.quizIntervalMinutes || DEFAULT_SETTINGS.quizIntervalMinutes,
        );
        quizNumQuestionsInput.value = String(
          settings.quizNumQuestions || DEFAULT_SETTINGS.quizNumQuestions,
        );
        quizAutoEnabledInput.checked =
          typeof settings.quizAutoEnabled === "boolean"
            ? settings.quizAutoEnabled
            : DEFAULT_SETTINGS.quizAutoEnabled;
        resolve();
      },
    );
  });
}

async function saveSettings() {
  const {
    apiKeyInput,
    modelInput,
    quizIntervalInput,
    quizNumQuestionsInput,
    quizAutoEnabledInput,
    saveButton,
  } = getInputs();

  saveButton.disabled = true;
  setStatus("Saving…");

  const settings: ExtensionSettings = {
    geminiApiKey: apiKeyInput.value.trim(),
    geminiModel: modelInput.value.trim() || DEFAULT_SETTINGS.geminiModel,
    quizIntervalMinutes: sanitizeNumber(
      quizIntervalInput.value,
      DEFAULT_SETTINGS.quizIntervalMinutes,
      1,
      60,
    ),
    quizNumQuestions: sanitizeNumber(
      quizNumQuestionsInput.value,
      DEFAULT_SETTINGS.quizNumQuestions,
      1,
      10,
    ),
    quizAutoEnabled: quizAutoEnabledInput.checked,
  };

  chrome.storage.sync.set({ [DEFAULT_SETTINGS_KEY]: settings }, () => {
    if (chrome.runtime.lastError) {
      setStatus(
        `Error saving settings: ${chrome.runtime.lastError.message}`,
        "error",
      );
    } else {
      setStatus("Settings saved.", "ok");
    }
    saveButton.disabled = false;
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadSettings()
    .then(() => {
      setStatus("Loaded settings.");
    })
    .catch((err) => {
      console.error(err);
      setStatus("Failed to load settings.", "error");
    });

  const { saveButton } = getInputs();
  saveButton.addEventListener("click", () => {
    void saveSettings();
  });
});
