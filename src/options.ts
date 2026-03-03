type ExtensionSettings = {
  openaiApiKey: string;
  openaiModel: string;
  quizIntervalMinutes: number;
  quizNumQuestions: number;
  quizAutoEnabled: boolean;
};

declare const chrome: any;

const DEFAULT_SETTINGS: ExtensionSettings = {
  openaiApiKey: "",
  openaiModel: "gpt-4.1-mini",
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
    apiKeyInput: $("openai-api-key") as HTMLInputElement,
    modelInput: $("openai-model") as HTMLInputElement,
    quizIntervalInput: $("quiz-interval-minutes") as HTMLInputElement,
    quizNumQuestionsInput: $("quiz-num-questions") as HTMLInputElement,
    quizAutoEnabledInput: $("quiz-auto-enabled") as HTMLInputElement,
    saveButton: $("save-button") as HTMLButtonElement,
    statusEl: $("status") as HTMLSpanElement,
  };
}

function setStatus(message: string, kind: "ok" | "error" | "neutral" = "neutral") {
  const { statusEl } = getInputs();
  statusEl.textContent = message;
  statusEl.classList.remove("ok", "error");
  if (kind === "ok") statusEl.classList.add("ok");
  if (kind === "error") statusEl.classList.add("error");
}

function sanitizeNumber(raw: string, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

async function loadSettings() {
  const { apiKeyInput, modelInput, quizIntervalInput, quizNumQuestionsInput, quizAutoEnabledInput } = getInputs();

  return new Promise<void>((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items: ExtensionSettings) => {
      const settings = items;
      apiKeyInput.value = settings.openaiApiKey ?? "";
      modelInput.value = settings.openaiModel || DEFAULT_SETTINGS.openaiModel;
      quizIntervalInput.value = String(settings.quizIntervalMinutes || DEFAULT_SETTINGS.quizIntervalMinutes);
      quizNumQuestionsInput.value = String(settings.quizNumQuestions || DEFAULT_SETTINGS.quizNumQuestions);
      quizAutoEnabledInput.checked =
        typeof settings.quizAutoEnabled === "boolean"
          ? settings.quizAutoEnabled
          : DEFAULT_SETTINGS.quizAutoEnabled;
      resolve();
    });
  });
}

async function saveSettings() {
  const { apiKeyInput, modelInput, quizIntervalInput, quizNumQuestionsInput, quizAutoEnabledInput, saveButton } =
    getInputs();

  saveButton.disabled = true;
  setStatus("Saving…");

  const settings: ExtensionSettings = {
    openaiApiKey: apiKeyInput.value.trim(),
    openaiModel: modelInput.value.trim() || DEFAULT_SETTINGS.openaiModel,
    quizIntervalMinutes: sanitizeNumber(
      quizIntervalInput.value,
      DEFAULT_SETTINGS.quizIntervalMinutes,
      1,
      60,
    ),
    quizNumQuestions: sanitizeNumber(quizNumQuestionsInput.value, DEFAULT_SETTINGS.quizNumQuestions, 1, 10),
    quizAutoEnabled: quizAutoEnabledInput.checked,
  };

  chrome.storage.sync.set(settings, () => {
    if (chrome.runtime.lastError) {
      setStatus(`Error saving settings: ${chrome.runtime.lastError.message}`, "error");
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

