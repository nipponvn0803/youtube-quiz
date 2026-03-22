import { DEFAULT_SETTINGS_KEY } from "./background";
import { AIProvider, ExtensionSettings } from "./shared/types";
import { listModels, RECOMMENDED_MODELS } from "./aiClient";
import { sanitizeNumber } from "./shared/utils";

const API_KEY_URLS: Record<AIProvider, string> = {
  gemini:    "https://aistudio.google.com/apikey",
  openai:    "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
  grok:      "https://console.x.ai/",
};

const DEFAULT_SETTINGS: ExtensionSettings = {
  provider: "gemini",
  apiKey: "",
  model: "gemini-2.0-flash",
  quizIntervalMinutes: 5,
  quizNumQuestions: 3,
};

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element with id="${id}"`);
  return el;
}

function getInputs() {
  return {
    providerSelect:       $("ai-provider")           as HTMLSelectElement,
    apiKeyInput:          $("ai-api-key")             as HTMLInputElement,
    getApiKeyLink:        $("get-api-key-link")       as HTMLAnchorElement,
    testConnectionBtn:    $("test-connection-btn")    as HTMLButtonElement,
    testConnectionResult: $("test-connection-result") as HTMLSpanElement,
    modelSelect:          $("ai-model")               as HTMLSelectElement,
    fetchModelsBtn:       $("fetch-models-btn")       as HTMLButtonElement,
    quizIntervalInput:    $("quiz-interval-minutes")  as HTMLInputElement,
    quizNumQuestionsInput:$("quiz-num-questions")     as HTMLInputElement,
    statusEl:             $("status")                 as HTMLSpanElement,
    onboardingBanner:     $("onboarding-banner")      as HTMLDivElement,
  };
}

function updateApiKeyLink(provider: AIProvider) {
  const { getApiKeyLink } = getInputs();
  getApiKeyLink.href = API_KEY_URLS[provider];
}

function setStatus(message: string, kind: "ok" | "error" | "neutral" = "neutral") {
  const { statusEl } = getInputs();
  statusEl.textContent = message;
  statusEl.classList.remove("ok", "error");
  if (kind === "ok") statusEl.classList.add("ok");
  if (kind === "error") statusEl.classList.add("error");
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
  const { providerSelect, apiKeyInput, quizIntervalInput, quizNumQuestionsInput } = getInputs();

  return new Promise<void>((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS_KEY, async (items: { [key: string]: unknown }) => {
      const s = ((items[DEFAULT_SETTINGS_KEY] ?? {}) as ExtensionSettings);
      const provider: AIProvider = s.provider ?? DEFAULT_SETTINGS.provider;
      const apiKey = s.apiKey ?? "";
      const model = s.model || DEFAULT_SETTINGS.model;

      providerSelect.value = provider;
      apiKeyInput.value = apiKey;
      updateApiKeyLink(provider);
      if (!apiKey) getInputs().onboardingBanner.style.display = "block";
      quizIntervalInput.value = String(s.quizIntervalMinutes || DEFAULT_SETTINGS.quizIntervalMinutes);
      quizNumQuestionsInput.value = String(s.quizNumQuestions || DEFAULT_SETTINGS.quizNumQuestions);

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
  const { providerSelect, apiKeyInput, modelSelect, quizIntervalInput, quizNumQuestionsInput } = getInputs();

  setStatus("Saving…");

  const settings: ExtensionSettings = {
    provider: providerSelect.value as AIProvider,
    apiKey: apiKeyInput.value.trim(),
    model: modelSelect.value || DEFAULT_SETTINGS.model,
    quizIntervalMinutes: sanitizeNumber(quizIntervalInput.value, DEFAULT_SETTINGS.quizIntervalMinutes, 1, 60),
    quizNumQuestions: sanitizeNumber(quizNumQuestionsInput.value, DEFAULT_SETTINGS.quizNumQuestions, 1, 10),
  };

  if (settings.apiKey) getInputs().onboardingBanner.style.display = "none";

  chrome.storage.sync.set({ [DEFAULT_SETTINGS_KEY]: settings }, () => {
    if (chrome.runtime.lastError) {
      setStatus(`Error saving: ${chrome.runtime.lastError.message}`, "error");
    } else {
      setStatus("Settings saved.", "ok");
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadSettings().catch((err) => {
    console.error(err);
    setStatus("Failed to load settings.", "error");
  });

  const { providerSelect, apiKeyInput, testConnectionBtn, fetchModelsBtn, modelSelect, quizIntervalInput, quizNumQuestionsInput } = getInputs();

  const debouncedSave = debounce(() => { void saveSettings(); }, 600);

  providerSelect.addEventListener("change", () => {
    updateApiKeyLink(providerSelect.value as AIProvider);
    modelSelect.innerHTML = '<option disabled selected>Click "Fetch models"</option>';
    void saveSettings();
  });

  const debouncedFetchModels = debounce(() => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) void fetchAndPopulateModels(providerSelect.value as AIProvider, apiKey, modelSelect.value);
  }, 600);

  apiKeyInput.addEventListener("input", () => { debouncedSave(); debouncedFetchModels(); });
  modelSelect.addEventListener("change", () => { void saveSettings(); });
  quizIntervalInput.addEventListener("input", debouncedSave);
  quizNumQuestionsInput.addEventListener("input", debouncedSave);

  testConnectionBtn.addEventListener("click", async () => {
    const apiKey = apiKeyInput.value.trim();
    const provider = providerSelect.value as AIProvider;
    const { testConnectionResult } = getInputs();

    if (!apiKey) { setStatus("Enter an API key first.", "error"); return; }

    testConnectionBtn.disabled = true;
    testConnectionBtn.textContent = "Testing…";
    testConnectionResult.textContent = "";
    testConnectionResult.className = "";

    try {
      await listModels(provider, apiKey);
      testConnectionResult.textContent = "✓ Connected";
      testConnectionResult.className = "ok";
    } catch (err) {
      testConnectionResult.textContent = `✗ ${String(err).replace(/^Error:\s*/, "")}`;
      testConnectionResult.className = "error";
      console.error("Test connection failed:", err);
    } finally {
      testConnectionBtn.disabled = false;
      testConnectionBtn.textContent = "Test connection";
    }
  });

  fetchModelsBtn.addEventListener("click", () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) { setStatus("Enter an API key first.", "error"); return; }
    void fetchAndPopulateModels(providerSelect.value as AIProvider, apiKey, modelSelect.value);
  });
});
