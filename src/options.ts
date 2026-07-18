import { DEFAULT_SETTINGS_KEY } from "./background";
import { AIProvider, ExtensionSettings, PROVIDER_ONDEVICE } from "./shared/types";
import { listModels, RECOMMENDED_MODELS } from "./aiClient";
import { sanitizeNumber } from "./shared/utils";
import { checkOnDeviceAvailability, downloadOnDeviceModel } from "./shared/ondeviceAvailability";

const API_KEY_URLS: Record<AIProvider, string> = {
  gemini:    "https://aistudio.google.com/apikey",
  openai:    "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
  grok:      "https://console.x.ai/",
  ondevice:  "",
};

const DEFAULT_SETTINGS: ExtensionSettings = {
  provider: PROVIDER_ONDEVICE,
  apiKey: "",
  model: "",
  quizIntervalMinutes: 5,
  quizNumQuestions: 3,
  enabled: true,
};

let downloadPromise: Promise<void> | null = null;
let downloadRetryCount = 0;
const MAX_AUTO_DOWNLOAD_RETRIES = 2;

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
    enabledToggle:        $("quiz-enabled")           as HTMLInputElement,
    apiKeySection:        $("api-key-section")             as HTMLDivElement,
    modelSection:         $("model-section")               as HTMLDivElement,
    ondeviceStatus:       $("ondevice-status")              as HTMLDivElement,
    ondeviceStatusText:   $("ondevice-status-text")         as HTMLParagraphElement,
    ondeviceDownloadHint: $("ondevice-download-hint")       as HTMLParagraphElement,
    ondeviceProgressRow:  $("ondevice-progress-row")        as HTMLDivElement,
    ondeviceProgress:     $("ondevice-download-progress")   as HTMLProgressElement,
    ondeviceDownloadBtn:  $("ondevice-download-btn")         as HTMLButtonElement,
    ondeviceUnavailableBanner: $("ondevice-unavailable-banner") as HTMLDivElement,
    switchToCloudBtn:     $("switch-to-cloud-btn")           as HTMLButtonElement,
  };
}

function applyProviderVisibility(provider: AIProvider) {
  const { apiKeySection, modelSection, ondeviceStatus, ondeviceUnavailableBanner } = getInputs();
  const isOnDevice = provider === PROVIDER_ONDEVICE;

  apiKeySection.style.display = isOnDevice ? "none" : "";
  modelSection.style.display = isOnDevice ? "none" : "";
  ondeviceStatus.style.display = isOnDevice ? "" : "none";

  if (!isOnDevice) {
    ondeviceUnavailableBanner.style.display = "none";
  } else {
    void refreshOnDeviceStatus();
  }
}

async function refreshOnDeviceStatus() {
  const { ondeviceStatusText, ondeviceDownloadHint, ondeviceProgressRow, ondeviceDownloadBtn, ondeviceUnavailableBanner } = getInputs();
  const availability = await checkOnDeviceAvailability();

  if (availability === "available") {
    ondeviceStatusText.textContent = "✓ Ready — no download needed.";
    ondeviceDownloadHint.style.display = "none";
    ondeviceProgressRow.style.display = "none";
    ondeviceDownloadBtn.style.display = "none";
    ondeviceUnavailableBanner.style.display = "none";
    return;
  }

  if (availability === "downloadable") {
    ondeviceStatusText.textContent = "The on-device model hasn't been downloaded yet.";
    ondeviceDownloadHint.style.display = "";
    ondeviceProgressRow.style.display = "none";
    ondeviceDownloadBtn.style.display = "";
    ondeviceDownloadBtn.disabled = false;
    ondeviceDownloadBtn.textContent = "Download model now";
    ondeviceUnavailableBanner.style.display = "none";
    return;
  }

  if (availability === "downloading") {
    ondeviceStatusText.textContent = "Downloading the on-device model…";
    ondeviceDownloadHint.style.display = "";
    ondeviceProgressRow.style.display = "flex";
    ondeviceDownloadBtn.style.display = "none";
    ondeviceUnavailableBanner.style.display = "none";
    // A download is already in flight (e.g. started in an earlier page load) but no
    // listener is currently attached to it. Chrome has no separate "query progress"
    // API — the only way to observe progress is a `monitor` passed into `create()`,
    // and calling `create()` again joins the existing download rather than starting
    // a new one. Re-attach so the bar actually moves instead of sitting at 0 until
    // availability() eventually flips to "available" on its own.
    void startOnDeviceDownload();
    return;
  }

  // "unsupported" | "unavailable"
  ondeviceStatusText.textContent = "On-device AI isn't available on this browser or device.";
  ondeviceDownloadHint.style.display = "none";
  ondeviceProgressRow.style.display = "none";
  ondeviceDownloadBtn.style.display = "none";
  ondeviceUnavailableBanner.style.display = "block";
}

async function startOnDeviceDownload(isManualRetry = false): Promise<void> {
  if (downloadPromise) return downloadPromise;
  if (isManualRetry) downloadRetryCount = 0;

  const { ondeviceProgress, ondeviceProgressRow, ondeviceDownloadHint, ondeviceDownloadBtn } = getInputs();
  ondeviceProgress.value = 0;
  ondeviceProgressRow.style.display = "flex";
  ondeviceDownloadHint.style.display = "";
  ondeviceDownloadBtn.style.display = "none";

  downloadPromise = (async () => {
    try {
      await downloadOnDeviceModel((fraction) => {
        getInputs().ondeviceProgress.value = fraction * 100;
      });
      downloadRetryCount = 0;
      await refreshOnDeviceStatus();
    } catch (err) {
      downloadRetryCount += 1;
      if (downloadRetryCount > MAX_AUTO_DOWNLOAD_RETRIES) {
        const { ondeviceStatusText, ondeviceDownloadHint: hint, ondeviceProgressRow: row, ondeviceDownloadBtn: btn } = getInputs();
        row.style.display = "none";
        hint.style.display = "none";
        ondeviceStatusText.textContent = `Download failed: ${String(err)}`;
        btn.style.display = "";
        btn.disabled = false;
        btn.textContent = "Retry download";
      } else {
        await refreshOnDeviceStatus();
      }
    } finally {
      downloadPromise = null;
    }
  })();

  return downloadPromise;
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
      applyProviderVisibility(provider);
      if (provider !== PROVIDER_ONDEVICE && !apiKey) getInputs().onboardingBanner.style.display = "block";
      quizIntervalInput.value = String(s.quizIntervalMinutes || DEFAULT_SETTINGS.quizIntervalMinutes);
      quizNumQuestionsInput.value = String(s.quizNumQuestions || DEFAULT_SETTINGS.quizNumQuestions);
      getInputs().enabledToggle.checked = s.enabled ?? true;

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
  const { providerSelect, apiKeyInput, modelSelect, quizIntervalInput, quizNumQuestionsInput, enabledToggle } = getInputs();

  setStatus("Saving…");

  const settings: ExtensionSettings = {
    provider: providerSelect.value as AIProvider,
    apiKey: apiKeyInput.value.trim(),
    model: modelSelect.value || DEFAULT_SETTINGS.model,
    quizIntervalMinutes: sanitizeNumber(quizIntervalInput.value, DEFAULT_SETTINGS.quizIntervalMinutes, 1, 60),
    quizNumQuestions: sanitizeNumber(quizNumQuestionsInput.value, DEFAULT_SETTINGS.quizNumQuestions, 1, 10),
    enabled: enabledToggle.checked,
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

  const { providerSelect, apiKeyInput, testConnectionBtn, fetchModelsBtn, modelSelect, quizIntervalInput, quizNumQuestionsInput, enabledToggle, ondeviceDownloadBtn, switchToCloudBtn } = getInputs();

  const debouncedSave = debounce(() => { void saveSettings(); }, 600);

  providerSelect.addEventListener("change", () => {
    const provider = providerSelect.value as AIProvider;
    updateApiKeyLink(provider);
    applyProviderVisibility(provider);
    modelSelect.innerHTML = '<option disabled selected>Click "Fetch models"</option>';
    void saveSettings();
  });

  ondeviceDownloadBtn.addEventListener("click", () => {
    const { ondeviceDownloadBtn: btn } = getInputs();
    btn.disabled = true;
    btn.textContent = "Downloading…";
    void startOnDeviceDownload(true);
  });

  switchToCloudBtn.addEventListener("click", () => {
    providerSelect.value = "gemini";
    updateApiKeyLink("gemini");
    applyProviderVisibility("gemini");
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
  enabledToggle.addEventListener("change", () => { void saveSettings(); });

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
