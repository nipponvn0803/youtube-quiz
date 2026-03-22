import { DEFAULT_SETTINGS_KEY } from "./background";
import { AIProvider, ExtensionSettings } from "./shared/types";
import { listModels, RECOMMENDED_MODELS } from "./aiClient";

const DEFAULT_SETTINGS: ExtensionSettings = {
  provider: "gemini",
  apiKey: "",
  model: "gemini-2.0-flash",
  quizIntervalMinutes: 5,
  quizNumQuestions: 3,
  quizAutoEnabled: true,
};

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element with id="${id}"`);
  return el;
}

function getInputs() {
  return {
    providerSelect:         $("ai-provider")            as HTMLSelectElement,
    apiKeyInput:            $("ai-api-key")             as HTMLInputElement,
    modelSelect:            $("ai-model")               as HTMLSelectElement,
    fetchModelsBtn:         $("fetch-models-btn")       as HTMLButtonElement,
    quizIntervalInput:      $("quiz-interval-minutes")  as HTMLInputElement,
    quizNumQuestionsInput:  $("quiz-num-questions")     as HTMLInputElement,
    quizAutoEnabledInput:   $("quiz-auto-enabled")      as HTMLInputElement,
    saveButton:             $("save-button")            as HTMLButtonElement,
    statusEl:               $("status")                 as HTMLSpanElement,
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

function populateModelSelect(models: string[], selectedModel: string, provider: AIProvider) {
  const { modelSelect } = getInputs();
  const recommended = RECOMMENDED_MODELS[provider];
  // Fall back to recommended when no prior selection exists
  const active = selectedModel || recommended;

  modelSelect.innerHTML = "";
  const ordered = [
    ...models.filter((m) => m === recommended),
    ...models.filter((m) => m !== recommended),
  ];

  for (const m of ordered) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m === recommended ? `${m} (Recommended)` : m;
    if (m === active) opt.selected = true;
    modelSelect.appendChild(opt);
  }

  // If saved model isn't in the list, preserve it as an option
  if (!models.includes(active) && active) {
    const opt = document.createElement("option");
    opt.value = active;
    opt.textContent = active;
    opt.selected = true;
    modelSelect.insertBefore(opt, modelSelect.firstChild);
  }
}

async function fetchAndPopulateModels(provider: AIProvider, apiKey: string, selectedModel: string) {
  const { fetchModelsBtn, modelSelect } = getInputs();
  fetchModelsBtn.disabled = true;
  fetchModelsBtn.textContent = "Loading…";
  modelSelect.innerHTML = "<option disabled selected>Loading models…</option>";

  try {
    const models = await listModels(provider, apiKey);
    if (models.length === 0) {
      modelSelect.innerHTML = "<option disabled selected>No models found</option>";
    } else {
      populateModelSelect(models, selectedModel, provider);
    }
  } catch (err) {
    modelSelect.innerHTML = "<option disabled selected>Failed to load models</option>";
    setStatus(`Could not fetch models: ${String(err)}`, "error");
  } finally {
    fetchModelsBtn.disabled = false;
    fetchModelsBtn.textContent = "Fetch models";
  }
}

async function loadSettings() {
  const { providerSelect, apiKeyInput, quizIntervalInput, quizNumQuestionsInput, quizAutoEnabledInput } = getInputs();

  return new Promise<void>((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS_KEY, async (items: { [key: string]: unknown }) => {
      const s = ((items[DEFAULT_SETTINGS_KEY] ?? {}) as ExtensionSettings);
      const provider: AIProvider = s.provider ?? DEFAULT_SETTINGS.provider;
      const apiKey = s.apiKey ?? "";
      const model = s.model || DEFAULT_SETTINGS.model;

      providerSelect.value = provider;
      apiKeyInput.value = apiKey;
      quizIntervalInput.value = String(s.quizIntervalMinutes || DEFAULT_SETTINGS.quizIntervalMinutes);
      quizNumQuestionsInput.value = String(s.quizNumQuestions || DEFAULT_SETTINGS.quizNumQuestions);
      quizAutoEnabledInput.checked = typeof s.quizAutoEnabled === "boolean"
        ? s.quizAutoEnabled
        : DEFAULT_SETTINGS.quizAutoEnabled;

      if (apiKey) {
        await fetchAndPopulateModels(provider, apiKey, model);
      } else {
        const { modelSelect } = getInputs();
        modelSelect.innerHTML = "<option disabled selected>Enter an API key first</option>";
      }

      resolve();
    });
  });
}

async function saveSettings() {
  const { providerSelect, apiKeyInput, modelSelect, quizIntervalInput, quizNumQuestionsInput, quizAutoEnabledInput, saveButton } = getInputs();

  saveButton.disabled = true;
  setStatus("Saving…");

  const settings: ExtensionSettings = {
    provider: providerSelect.value as AIProvider,
    apiKey: apiKeyInput.value.trim(),
    model: modelSelect.value || DEFAULT_SETTINGS.model,
    quizIntervalMinutes: sanitizeNumber(quizIntervalInput.value, DEFAULT_SETTINGS.quizIntervalMinutes, 1, 60),
    quizNumQuestions: sanitizeNumber(quizNumQuestionsInput.value, DEFAULT_SETTINGS.quizNumQuestions, 1, 10),
    quizAutoEnabled: quizAutoEnabledInput.checked,
  };

  chrome.storage.sync.set({ [DEFAULT_SETTINGS_KEY]: settings }, () => {
    if (chrome.runtime.lastError) {
      setStatus(`Error saving: ${chrome.runtime.lastError.message}`, "error");
    } else {
      setStatus("Settings saved.", "ok");
    }
    saveButton.disabled = false;
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadSettings()
    .then(() => setStatus("Settings loaded."))
    .catch((err) => {
      console.error(err);
      setStatus("Failed to load settings.", "error");
    });

  const { providerSelect, apiKeyInput, fetchModelsBtn, modelSelect, saveButton } = getInputs();

  // Re-clear model list when provider changes
  providerSelect.addEventListener("change", () => {
    modelSelect.innerHTML = '<option disabled selected>Click "Fetch models"</option>';
  });

  fetchModelsBtn.addEventListener("click", () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      setStatus("Enter an API key first.", "error");
      return;
    }
    void fetchAndPopulateModels(providerSelect.value as AIProvider, apiKey, modelSelect.value);
  });

  saveButton.addEventListener("click", () => { void saveSettings(); });
});
