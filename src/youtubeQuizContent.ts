type QuizOption = { text: string };

type QuizQuestion = {
  id: string;
  text: string;
  options: QuizOption[];
  correctIndex: number;
  explanation?: string;
};

type QuizRequestMessage = {
  type: "REQUEST_QUIZ";
  videoId: string;
  videoUrl: string;
  currentTimeSeconds: number;
  numQuestions: number;
};

type QuizResponseMessage =
  | { type: "QUIZ_SUCCESS"; questions: QuizQuestion[] }
  | { type: "QUIZ_ERROR"; error: string };

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

type QuizState = {
  lastQuizTimeSeconds: number;
  quizInProgress: boolean;
};

const quizState: QuizState = {
  lastQuizTimeSeconds: 0,
  quizInProgress: false,
};

function getYouTubeVideoElement(): HTMLVideoElement | null {
  const video = document.querySelector("video");
  if (video instanceof HTMLVideoElement) {
    return video;
  }
  return null;
}

function getVideoIdFromUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.searchParams.has("v")) {
      return u.searchParams.get("v") || "";
    }
    // Shorts or other formats: try last path segment.
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  } catch {
    return "";
  }
}

function loadSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items: ExtensionSettings) => {
      resolve(items);
    });
  });
}

function shouldTriggerQuiz(currentTimeSeconds: number, settings: ExtensionSettings): boolean {
  if (!settings.quizAutoEnabled) return false;
  const intervalSeconds = Math.max(60, settings.quizIntervalMinutes * 60); // minimum 1 minute
  return (
    currentTimeSeconds - quizState.lastQuizTimeSeconds >= intervalSeconds && !quizState.quizInProgress
  );
}

function createOverlayRoot(): ShadowRoot {
  let host = document.getElementById("yt-quiz-overlay-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "yt-quiz-overlay-host";
    host.style.position = "absolute";
    host.style.top = "0";
    host.style.left = "0";
    host.style.width = "100%";
    host.style.height = "100%";
    host.style.pointerEvents = "none";
    host.style.zIndex = "999999";

    const player = document.getElementById("movie_player") || document.body;
    player.appendChild(host);
  }
  return host.shadowRoot || host.attachShadow({ mode: "open" });
}

function renderQuizOverlay(questions: QuizQuestion[], onComplete: () => void) {
  const shadow = createOverlayRoot();
  shadow.innerHTML = "";

  // #region agent log
  fetch("http://127.0.0.1:7529/ingest/5bdccf75-2eca-4fc5-bfb1-4c600fd0270a", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "8a33ad",
    },
    body: JSON.stringify({
      sessionId: "8a33ad",
      runId: "run1",
      hypothesisId: "H4",
      location: "src/youtubeQuizContent.ts:renderQuizOverlay",
      message: "Rendering quiz overlay",
      data: {
        questionsCount: questions.length,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion agent log

  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.top = "0";
  container.style.left = "0";
  container.style.width = "100%";
  container.style.height = "100%";
  container.style.background = "rgba(0, 0, 0, 0.8)";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.alignItems = "center";
  container.style.justifyContent = "center";
  container.style.color = "#fff";
  container.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  container.style.pointerEvents = "auto";

  let currentIndex = 0;
  const answers = new Map<string, number>();

  const card = document.createElement("div");
  card.style.background = "#111";
  card.style.borderRadius = "12px";
  card.style.padding = "24px";
  card.style.maxWidth = "640px";
  card.style.width = "90%";
  card.style.boxShadow = "0 8px 24px rgba(0,0,0,0.5)";

  const titleEl = document.createElement("h2");
  titleEl.textContent = "Quick quiz about what you just watched";
  titleEl.style.marginTop = "0";
  titleEl.style.marginBottom = "16px";

  const questionEl = document.createElement("p");
  questionEl.style.fontSize = "16px";
  questionEl.style.marginBottom = "16px";

  const optionsList = document.createElement("div");
  optionsList.style.display = "flex";
  optionsList.style.flexDirection = "column";
  optionsList.style.gap = "8px";

  const feedbackEl = document.createElement("div");
  feedbackEl.style.marginTop = "12px";
  feedbackEl.style.minHeight = "20px";
  feedbackEl.style.fontSize = "14px";

  const actionsRow = document.createElement("div");
  actionsRow.style.display = "flex";
  actionsRow.style.justifyContent = "space-between";
  actionsRow.style.alignItems = "center";
  actionsRow.style.marginTop = "20px";

  const progressEl = document.createElement("span");
  progressEl.style.fontSize = "13px";
  progressEl.style.opacity = "0.8";

  const nextButton = document.createElement("button");
  nextButton.textContent = "Next";
  nextButton.style.background = "#3ea6ff";
  nextButton.style.border = "none";
  nextButton.style.borderRadius = "999px";
  nextButton.style.padding = "8px 16px";
  nextButton.style.color = "#000";
  nextButton.style.fontWeight = "600";
  nextButton.style.cursor = "pointer";

  actionsRow.appendChild(progressEl);
  actionsRow.appendChild(nextButton);

  card.appendChild(titleEl);
  card.appendChild(questionEl);
  card.appendChild(optionsList);
  card.appendChild(feedbackEl);
  card.appendChild(actionsRow);

  container.appendChild(card);
  shadow.appendChild(container);

  function renderQuestion(index: number) {
    const q = questions[index];
    if (!q) {
      // No question at this index; nothing to render.
      return;
    }
    questionEl.textContent = q.text;
    progressEl.textContent = `Question ${index + 1} of ${questions.length}`;
    feedbackEl.textContent = "";

    optionsList.innerHTML = "";
    q.options.forEach((opt, optIndex) => {
      const btn = document.createElement("button");
      btn.textContent = opt.text;
      btn.style.textAlign = "left";
      btn.style.padding = "8px 12px";
      btn.style.borderRadius = "8px";
      btn.style.border = "1px solid rgba(255,255,255,0.2)";
      btn.style.background = "rgba(255,255,255,0.05)";
      btn.style.color = "#fff";
      btn.style.cursor = "pointer";

      btn.addEventListener("click", () => {
        answers.set(q.id, optIndex);
        if (optIndex === q.correctIndex) {
          feedbackEl.textContent = "Correct!";
          feedbackEl.style.color = "#4caf50";
        } else {
          feedbackEl.textContent =
            q.explanation || "Not quite. Review the video section for the correct answer.";
          feedbackEl.style.color = "#ff9800";
        }
      });

      optionsList.appendChild(btn);
    });

    nextButton.textContent = index === questions.length - 1 ? "Finish" : "Next";
  }

  nextButton.addEventListener("click", () => {
    if (currentIndex < questions.length - 1) {
      currentIndex += 1;
      renderQuestion(currentIndex);
    } else {
      shadow.innerHTML = "";
      onComplete();
    }
  });

  renderQuestion(currentIndex);
}

function requestQuiz(
  videoId: string,
  videoUrl: string,
  currentTimeSeconds: number,
  numQuestions: number,
): Promise<QuizResponseMessage> {
  const message: QuizRequestMessage = {
    type: "REQUEST_QUIZ",
    videoId,
    videoUrl,
    currentTimeSeconds,
    numQuestions,
  };

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: QuizResponseMessage) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) {
        reject(new Error("No response from background script."));
        return;
      }
      resolve(response);
    });
  });
}

async function maybeRunAutoQuiz(video: HTMLVideoElement) {
  const settings = await loadSettings();
  const currentTimeSeconds = video.currentTime;

  if (!shouldTriggerQuiz(currentTimeSeconds, settings)) {
    return;
  }

  const videoUrl = window.location.href;
  const videoId = getVideoIdFromUrl(videoUrl);

  quizState.quizInProgress = true;
  quizState.lastQuizTimeSeconds = currentTimeSeconds;

  const previousPlaybackRate = video.playbackRate;
  video.pause();

  try {
    const response = await requestQuiz(
      videoId,
      videoUrl,
      currentTimeSeconds,
      settings.quizNumQuestions,
    );

    if (response.type === "QUIZ_ERROR") {
      console.warn("Quiz error:", response.error);
      video.playbackRate = previousPlaybackRate;
      video.play();
      quizState.quizInProgress = false;
      return;
    }

    renderQuizOverlay(response.questions, () => {
      quizState.quizInProgress = false;
      video.playbackRate = previousPlaybackRate;
      video.play();
    });
  } catch (err) {
    console.error("Failed to request quiz:", err);
    quizState.quizInProgress = false;
    video.playbackRate = previousPlaybackRate;
    video.play();
  }
}

function startPolling() {
  const video = getYouTubeVideoElement();
  if (!video) {
    // Try again shortly – player may not be ready yet.
    setTimeout(startPolling, 1000);
    return;
  }

  // Poll every ~15 seconds to see if we should trigger a quiz.
  setInterval(() => {
    void maybeRunAutoQuiz(video);
  }, 15000);
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  startPolling();
} else {
  document.addEventListener("DOMContentLoaded", () => {
    startPolling();
  });
}

