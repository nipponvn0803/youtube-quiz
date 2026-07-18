import { ExtensionSettings, LOCALE_EN, QuizQuestion, QuizRequestMessage, QuizResponseMessage } from "./shared/types";
import { setLocale, t } from "./shared/i18n";

// Must match DEFAULT_SETTINGS_KEY in background.ts
const SETTINGS_KEY = "settings";

// ---------------------------------------------------------------------------
// In-memory session state — reset on each video navigation
// ---------------------------------------------------------------------------

interface SessionState {
  transcript: string | null;
  preGeneratedQuestions: QuizQuestion[] | null;
  isPreGenerating: boolean;
  preGenerationTriggered: boolean;
  nextQuizVideoTime: number;
  intervalSeconds: number;
  numQuestions: number;
  enabled: boolean;
  score: { correct: number; total: number };
  autoResume: boolean;
  quizShowing: boolean;
  lastKnownTime: number;
  lastQuizCheckpointSeconds: number;
  timerId: ReturnType<typeof setInterval> | null;
}

function freshState(): SessionState {
  return {
    transcript: null,
    preGeneratedQuestions: null,
    isPreGenerating: false,
    preGenerationTriggered: false,
    nextQuizVideoTime: Infinity,
    intervalSeconds: 60,
    numQuestions: 3,
    enabled: true,
    score: { correct: 0, total: 0 },
    autoResume: false,
    quizShowing: false,
    lastKnownTime: 0,
    lastQuizCheckpointSeconds: 0,
    timerId: null,
  };
}

let state = freshState();

// ---------------------------------------------------------------------------
// Transcript (forwarded from youtubeInterceptor.ts via CustomEvent)
// ---------------------------------------------------------------------------

type RawNode = Record<string, unknown>;

type TranscriptSegment = { startMs: number; text: string };

// Normalized transcript, sorted by startMs, so quiz generation can filter by
// time regardless of which endpoint it came from
let transcriptSegments: TranscriptSegment[] | null = null;

window.addEventListener("yt-quiz-transcript-data", (event) => {
  const detail = (event as CustomEvent<{ endpoint: string; data: RawNode }>).detail;
  if (!detail?.data) return;

  const segments =
    detail.endpoint === "timedtext"
      ? extractTimedtextSegments(detail.data)
      : extractInnerTubeSegments(detail.data);

  if (segments?.length) {
    // Keep the fuller transcript — e.g. don't let a partial caption chunk
    // replace the complete panel transcript
    if (!transcriptSegments || segments.length > transcriptSegments.length) {
      transcriptSegments = segments;
      console.log("youtube-quiz: transcript cached from", detail.endpoint, "| segments =", segments.length);
      showTranscriptBadge("ready");
    }
  } else if (detail.endpoint !== "get_panel") {
    // get_panel also serves non-transcript panels (chapters, comments, …)
    console.log("youtube-quiz:", detail.endpoint, "response had no transcript segments");
  }
});

// get_transcript and get_panel wrap the same transcriptSegmentListRenderer in
// different outer structures (and YouTube reshuffles them over time), so
// search for it recursively instead of hard-coding a path.
function findInitialSegments(node: unknown): RawNode[] | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findInitialSegments(item);
      if (found) return found;
    }
    return null;
  }
  const obj = node as RawNode;
  const list = (obj.transcriptSegmentListRenderer as RawNode | undefined)?.initialSegments;
  if (Array.isArray(list)) return list as RawNode[];
  for (const value of Object.values(obj)) {
    const found = findInitialSegments(value);
    if (found) return found;
  }
  return null;
}

function extractInnerTubeSegments(data: RawNode): TranscriptSegment[] | null {
  const initialSegments = findInitialSegments(data);
  if (!initialSegments) return null;

  const out: TranscriptSegment[] = [];
  for (const seg of initialSegments) {
    // Chapter headings use transcriptSectionHeaderRenderer — skip those
    const r = seg.transcriptSegmentRenderer as RawNode | undefined;
    if (!r) continue;
    const runs = (r.snippet as RawNode | undefined)?.runs as
      | Array<{ text: string }>
      | undefined;
    const text = runs?.map((x) => x.text).join("").trim();
    if (text) out.push({ startMs: Number(r.startMs ?? 0), text });
  }
  return out.length ? out : null;
}

// timedtext json3 shape: { events: [{ tStartMs, segs: [{ utf8 }] }] }
// Events without segs are styling/window markers; newline-only segs separate
// rolling caption lines.
function extractTimedtextSegments(data: RawNode): TranscriptSegment[] | null {
  const events = data.events as RawNode[] | undefined;
  if (!Array.isArray(events)) return null;

  const out: TranscriptSegment[] = [];
  for (const ev of events) {
    const segs = ev.segs as Array<{ utf8?: string }> | undefined;
    if (!segs) continue;
    const text = segs.map((s) => s.utf8 ?? "").join("").replace(/\s+/g, " ").trim();
    if (text) out.push({ startMs: Number(ev.tStartMs ?? 0), text });
  }
  return out.length ? out : null;
}

function getTranscriptUpTo(upToSeconds: number, fromSeconds = 0): string | null {
  if (!transcriptSegments) return null;
  const upToMs = upToSeconds * 1000;
  const fromMs = fromSeconds * 1000;
  const lines: string[] = [];
  for (const seg of transcriptSegments) {
    if (seg.startMs > upToMs) break;
    if (seg.startMs < fromMs) continue;
    lines.push(seg.text);
  }
  return lines.length ? lines.join(" ") : null;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function loadSettings(): Promise<ExtensionSettings | null> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(SETTINGS_KEY, (items) => {
      resolve((items[SETTINGS_KEY] as ExtensionSettings) ?? null);
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getVideoId(): string | null {
  return new URLSearchParams(window.location.search).get("v");
}

function getVideo(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>("video");
}

function waitForVideo(): Promise<HTMLVideoElement> {
  return new Promise((resolve) => {
    const check = () => {
      const v = getVideo();
      if (v) { resolve(v); return; }
      setTimeout(check, 200);
    };
    check();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForElement<T extends Element>(
  selector: string,
  timeout = 2000,
): Promise<T | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const el = document.querySelector<T>(selector);
      if (el) { resolve(el); return; }
      if (Date.now() - start >= timeout) { resolve(null); return; }
      setTimeout(check, 100);
    };
    check();
  });
}

// ---------------------------------------------------------------------------
// Auto-open transcript (language-independent)
// ---------------------------------------------------------------------------


async function tryAutoOpenTranscript(): Promise<boolean> {
  // Give YouTube time to finish rendering the page
  await sleep(1500);

  // Click the description section to expand it and reveal the "Show transcript" button
  const descriptionEl = document.getElementById("description-interaction");
  if (!descriptionEl) {
    console.log("youtube-quiz: description element not found, falling back to badge");
    return false;
  }

  descriptionEl.click();
  console.log("youtube-quiz: description clicked to expand");

  // Wait for the "Show transcript" button inside the description transcript section
  const showTranscriptBtn = await waitForElement<HTMLButtonElement>(
    "ytd-video-description-transcript-section-renderer button[aria-label]",
    3000,
  );
  if (!showTranscriptBtn) {
    console.log("youtube-quiz: Show transcript button not found, falling back to badge");
    return false;
  }

  showTranscriptBtn.click();
  console.log("youtube-quiz: Show transcript button clicked");

  return true;
}

// ---------------------------------------------------------------------------
// Quiz scheduling
// ---------------------------------------------------------------------------

function scheduleNextQuiz(fromVideoTime: number): void {
  state.nextQuizVideoTime = fromVideoTime + state.intervalSeconds;
  state.preGeneratedQuestions = null;
  state.preGenerationTriggered = false;
  console.log(
    "youtube-quiz: next quiz at video time",
    state.nextQuizVideoTime.toFixed(1),
    "s (in",
    state.intervalSeconds,
    "s)",
  );
}

function isAdPlaying(): boolean {
  return (
    document.documentElement.classList.contains("ad-showing") ||
    !!document.querySelector(".ytp-ad-player-overlay")
  );
}

function onTimerTick(): void {
  if (!state.enabled) return;
  const video = getVideo();
  if (!video || video.paused || state.quizShowing || isAdPlaying()) return;

  const t = video.currentTime;
  const timeToQuiz = state.nextQuizVideoTime - t;

  // Trigger pre-generation 20 seconds before quiz
  if (timeToQuiz <= 20 && !state.preGenerationTriggered) {
    state.preGenerationTriggered = true;
    void preGenerateQuiz(t);
  }

  // Show countdown in last 10 seconds
  if (timeToQuiz > 0 && timeToQuiz <= 10) {
    showCountdown(Math.ceil(timeToQuiz));
  } else if (timeToQuiz > 10) {
    removeCountdown();
  }

  // Quiz time — pause and show
  if (t >= state.nextQuizVideoTime) {
    removeCountdown();
    state.quizShowing = true;
    video.pause();
    console.log("youtube-quiz: quiz time, paused at", t.toFixed(1), "s");
    showQuizOrLoading(t);
  }

  state.lastKnownTime = t;
}

async function preGenerateQuiz(currentTime: number): Promise<void> {
  const videoId = getVideoId();
  const transcript = getTranscriptUpTo(currentTime, state.lastQuizCheckpointSeconds);

  if (!videoId || !transcript) {
    console.log("youtube-quiz: transcript not ready at pre-generation time, will generate on demand");
    return;
  }

  console.log("youtube-quiz: pre-generating quiz at", currentTime.toFixed(1), "s");
  state.isPreGenerating = true;

  const req: QuizRequestMessage = {
    type: "REQUEST_QUIZ",
    videoId,
    videoUrl: window.location.href,
    transcript,
    currentTimeSeconds: currentTime,
    numQuestions: state.numQuestions,
  };

  try {
    const res = (await chrome.runtime.sendMessage(req)) as QuizResponseMessage;
    if (res.type === "QUIZ_SUCCESS") {
      state.preGeneratedQuestions = res.questions;
      console.log("youtube-quiz: pre-generated", res.questions.length, "questions");
    } else {
      console.error("youtube-quiz: pre-generation returned error:", res.error);
    }
  } catch (err) {
    console.error("youtube-quiz: pre-generation failed:", err);
  } finally {
    state.isPreGenerating = false;
  }
}

function showQuizOrLoading(currentTime: number): void {
  if (state.preGeneratedQuestions) {
    showQuizDialog(state.preGeneratedQuestions);
    return;
  }

  showLoadingDialog();

  if (state.isPreGenerating) {
    // Wait for in-flight pre-generation to finish
    const poll = setInterval(() => {
      if (!state.quizShowing) {
        // User manually closed the loading dialog — stop waiting
        clearInterval(poll);
      } else if (state.preGeneratedQuestions) {
        clearInterval(poll);
        showQuizDialog(state.preGeneratedQuestions);
      } else if (!state.isPreGenerating) {
        clearInterval(poll);
        void generateAndShow(currentTime);
      }
    }, 200);
    return;
  }

  // Transcript wasn't ready at pre-generation time — try now
  void generateAndShow(currentTime);
}

async function generateAndShow(currentTime: number): Promise<void> {
  const videoId = getVideoId();
  const transcript = getTranscriptUpTo(currentTime, state.lastQuizCheckpointSeconds);

  if (!videoId || !transcript) {
    showErrorDialog(t("quiz_no_transcript_error"));
    return;
  }

  const req: QuizRequestMessage = {
    type: "REQUEST_QUIZ",
    videoId,
    videoUrl: window.location.href,
    transcript,
    currentTimeSeconds: currentTime,
    numQuestions: state.numQuestions,
  };

  try {
    const res = (await chrome.runtime.sendMessage(req)) as QuizResponseMessage;
    // User may have closed the loading dialog while the request was in flight —
    // don't pop a dialog back up over the resumed video
    if (!state.quizShowing) return;
    if (res.type === "QUIZ_SUCCESS") {
      showQuizDialog(res.questions);
    } else {
      showErrorDialog(res.error);
    }
  } catch (err) {
    if (!state.quizShowing) return;
    showErrorDialog(err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Seek detection
// ---------------------------------------------------------------------------

function setupSeekDetection(video: HTMLVideoElement): void {
  video.addEventListener("seeked", () => {
    const t = video.currentTime;
    const delta = Math.abs(t - state.lastKnownTime);
    if (delta > 15 && !state.quizShowing) {
      console.log("youtube-quiz: significant seek (", delta.toFixed(1), "s), rescheduling quiz");
      scheduleNextQuiz(t);
      removeCountdown();
    }
    state.lastKnownTime = t;
  });
}

// ---------------------------------------------------------------------------
// Transcript status badge (bottom-right)
// ---------------------------------------------------------------------------

function showTranscriptBadge(status: "pending" | "ready"): void {
  // Inject keyframes once
  if (!document.getElementById("yt-quiz-badge-style")) {
    const style = document.createElement("style");
    style.id = "yt-quiz-badge-style";
    style.textContent = `
      @keyframes yt-quiz-slide-in {
        from { opacity: 0; transform: translateY(-12px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes yt-quiz-fade-out {
        from { opacity: 1; }
        to   { opacity: 0; }
      }
      #yt-quiz-transcript-badge strong {
        color: #cbd5e1;
      }
    `;
    document.head.appendChild(style);
  }

  document.getElementById("yt-quiz-transcript-badge")?.remove();
  const el = document.createElement("div");
  el.id = "yt-quiz-transcript-badge";
  el.style.cssText = `
    position: fixed;
    top: 52px;
    right: 16px;
    width: 280px;
    background: #1e293b;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 10px;
    padding: 12px 14px;
    font-family: system-ui, -apple-system, sans-serif;
    z-index: 9999997;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    pointer-events: none;
    animation: yt-quiz-slide-in 0.22s ease forwards;
  `;

  if (status === "pending") {
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:1.32rem">📋</span>
        <div>
          <div style="font-size:0.94rem;font-weight:600;color:#e2e8f0;letter-spacing:0.02em">${t("badge_title")}</div>
          <div style="font-size:0.86rem;color:#94a3b8;margin-top:2px;line-height:1.4">
            ${t("badge_pending_desc")}
          </div>
        </div>
      </div>
    `;
  } else {
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:1.32rem">✅</span>
        <div>
          <div style="font-size:0.94rem;font-weight:600;color:#e2e8f0;letter-spacing:0.02em">${t("badge_title")}</div>
          <div style="font-size:0.86rem;color:#4ade80;margin-top:2px">${t("badge_ready_desc")}</div>
        </div>
      </div>
    `;
    setTimeout(() => {
      el.style.animation = "yt-quiz-fade-out 0.3s ease forwards";
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }

  el.appendChild(createCloseButton(() => el.remove(), { small: true }));

  document.body.appendChild(el);
}

// ---------------------------------------------------------------------------
// Countdown overlay (bottom-right, last 10 seconds)
// ---------------------------------------------------------------------------

function showCountdown(seconds: number): void {
  let el = document.getElementById("yt-quiz-countdown");

  if (!el) {
    el = document.createElement("div");
    el.id = "yt-quiz-countdown";
    el.style.cssText = `
      position: fixed;
      bottom: 72px;
      right: 20px;
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid rgba(56, 189, 248, 0.4);
      border-radius: 999px;
      padding: 8px 16px;
      color: #e5e7eb;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 1.02rem;
      font-weight: 600;
      z-index: 9999998;
      display: flex;
      align-items: center;
      gap: 10px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
      pointer-events: auto;
    `;

    const textEl = document.createElement("span");
    textEl.id = "yt-quiz-countdown-text";

    const skipBtn = document.createElement("button");
    skipBtn.textContent = t("skip_btn");
    skipBtn.style.cssText = `
      background: none;
      border: 1px solid rgba(148, 163, 184, 0.3);
      border-radius: 999px;
      color: #94a3b8;
      font-size: 0.9rem;
      padding: 2px 8px;
      cursor: pointer;
    `;
    skipBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeCountdown();
      const v = getVideo();
      if (v) scheduleNextQuiz(v.currentTime);
    });

    el.append(textEl, skipBtn);
    document.body.appendChild(el);
  }

  const textEl = document.getElementById("yt-quiz-countdown-text");
  if (textEl) textEl.textContent = t("quiz_in_seconds", { seconds });
}

function removeCountdown(): void {
  document.getElementById("yt-quiz-countdown")?.remove();
}

// ---------------------------------------------------------------------------
// Quiz dialog
// ---------------------------------------------------------------------------

function removeExistingDialog(): void {
  document.getElementById("yt-quiz-overlay")?.remove();
}

function dismissAndResume(): void {
  removeExistingDialog();
  state.quizShowing = false;
  const video = getVideo();
  if (video) {
    state.lastQuizCheckpointSeconds = video.currentTime;
    scheduleNextQuiz(video.currentTime);
    void video.play();
  }
}

function createOverlay(): HTMLDivElement {
  const el = document.createElement("div");
  el.id = "yt-quiz-overlay";
  el.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999999;
    font-family: system-ui, -apple-system, sans-serif;
  `;
  return el;
}

function createDialog(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `
    position: relative;
    background: #0f172a;
    border: 1px solid rgba(148, 163, 184, 0.3);
    border-radius: 16px;
    padding: 32px;
    max-width: 560px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.8);
    color: #e5e7eb;
  `;
  return el;
}

// "×" close button anchored to the top-right of its (position: relative) parent.
// `small` variant is used on the compact transcript badge.
function createCloseButton(onClose: () => void, opts: { small?: boolean } = {}): HTMLButtonElement {
  const size = opts.small ? 20 : 30;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.innerHTML = "&times;";
  btn.setAttribute("aria-label", t("close_btn"));
  btn.title = t("close_btn");
  btn.style.cssText = `
    position: absolute;
    top: ${opts.small ? 6 : 12}px;
    right: ${opts.small ? 6 : 14}px;
    width: ${size}px;
    height: ${size}px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    color: #9ca3af;
    font-size: ${opts.small ? 1.1 : 1.5}rem;
    line-height: 1;
    cursor: pointer;
    pointer-events: auto;
    transition: background 0.15s, color 0.15s;
  `;
  btn.addEventListener("mouseenter", () => {
    btn.style.background = "rgba(255, 255, 255, 0.14)";
    btn.style.color = "#e5e7eb";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.background = "rgba(255, 255, 255, 0.06)";
    btn.style.color = "#9ca3af";
  });
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClose();
  });
  return btn;
}

function showLoadingDialog(): void {
  removeExistingDialog();
  const overlay = createOverlay();
  const dialog = createDialog();

  const title = document.createElement("p");
  title.textContent = t("quiz_title");
  title.style.cssText = `margin: 0 0 16px; font-size: 0.96rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #38bdf8;`;

  const msg = document.createElement("p");
  msg.textContent = t("quiz_generating");
  msg.style.cssText = `margin: 0; font-size: 1.2rem; color: #9ca3af;`;

  dialog.append(title, msg);
  dialog.appendChild(createCloseButton(dismissAndResume));
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
}

function showErrorDialog(message: string): void {
  removeExistingDialog();
  state.quizShowing = false;

  const overlay = createOverlay();
  const dialog = createDialog();

  const title = document.createElement("p");
  title.textContent = t("quiz_title");
  title.style.cssText = `margin: 0 0 12px; font-size: 0.96rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #38bdf8;`;

  const msg = document.createElement("p");
  msg.textContent = t("quiz_generation_error", { message });
  msg.style.cssText = `margin: 0 0 16px; font-size: 1.14rem; color: #f97373;`;

  const btn = document.createElement("button");
  btn.textContent = t("continue_watching_btn");
  btn.style.cssText = primaryBtnStyle();
  btn.addEventListener("click", dismissAndResume);

  dialog.append(title, msg, btn);
  dialog.appendChild(createCloseButton(dismissAndResume));
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
}

function showQuizDialog(questions: QuizQuestion[]): void {
  removeExistingDialog();
  const overlay = createOverlay();
  const dialog = createDialog();

  // Header: title + live score. Right padding keeps the score clear of the "×".
  const header = document.createElement("div");
  header.style.cssText = `display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-right: 34px;`;

  const title = document.createElement("span");
  title.textContent = t("quiz_title");
  title.style.cssText = `font-size: 0.96rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #38bdf8;`;

  const scoreEl = document.createElement("span");
  scoreEl.id = "yt-quiz-score-display";
  scoreEl.style.cssText = `font-size: 1.02rem; color: #9ca3af;`;
  scoreEl.textContent = t("score_display", { correct: state.score.correct, total: state.score.total });

  header.append(title, scoreEl);
  dialog.appendChild(header);

  let answeredCount = 0;

  questions.forEach((q, qIdx) => {
    const qEl = document.createElement("div");
    if (qIdx > 0) qEl.style.marginTop = "28px";

    const qText = document.createElement("p");
    qText.textContent = `${qIdx + 1}. ${q.text}`;
    qText.style.cssText = `margin: 0 0 14px; font-size: 1.2rem; font-weight: 600; line-height: 1.5;`;

    const optionsList = document.createElement("div");
    optionsList.style.cssText = `display: flex; flex-direction: column; gap: 8px;`;

    const feedback = document.createElement("p");
    feedback.style.cssText = `margin: 10px 0 0; font-size: 1.02rem; min-height: 1em;`;

    let answered = false;

    const optionEls = q.options.map((opt, i) => {
      const btn = document.createElement("button");
      btn.textContent = opt.text;
      btn.style.cssText = `
        text-align: left;
        padding: 10px 14px;
        border-radius: 10px;
        border: 1px solid rgba(148, 163, 184, 0.3);
        background: rgba(255,255,255,0.04);
        color: #e5e7eb;
        font-size: 1.08rem;
        cursor: pointer;
        width: 100%;
      `;
      btn.addEventListener("mouseenter", () => {
        if (!answered) btn.style.background = "rgba(255,255,255,0.1)";
      });
      btn.addEventListener("mouseleave", () => {
        if (!answered) btn.style.background = "rgba(255,255,255,0.04)";
      });
      btn.addEventListener("click", () => {
        if (answered) return;
        answered = true;
        answeredCount++;

        const isCorrect = i === q.correctIndex;
        state.score.total++;
        if (isCorrect) state.score.correct++;

        // Update live score
        const scoreDisplay = document.getElementById("yt-quiz-score-display");
        if (scoreDisplay) {
          scoreDisplay.textContent = t("score_display", { correct: state.score.correct, total: state.score.total });
        }

        // Colour options
        optionEls.forEach((el, j) => {
          el.style.cursor = "default";
          if (j === q.correctIndex) {
            el.style.background = "rgba(74, 222, 128, 0.15)";
            el.style.borderColor = "#4ade80";
            el.style.color = "#4ade80";
          } else if (j === i && !isCorrect) {
            el.style.background = "rgba(249, 115, 115, 0.15)";
            el.style.borderColor = "#f97373";
            el.style.color = "#f97373";
          }
        });

        feedback.textContent = isCorrect
          ? t("correct_feedback")
          : t("incorrect_feedback", {
              explanation: q.explanation ?? t("incorrect_answer_fallback", { answer: q.options[q.correctIndex].text }),
            });
        feedback.style.color = isCorrect ? "#4ade80" : "#f97373";

        if (answeredCount === questions.length) {
          continueSection.style.display = "flex";
          if (state.autoResume) {
            setTimeout(dismissAndResume, 1500);
          }
        }
      });

      optionsList.appendChild(btn);
      return btn;
    });

    qEl.append(qText, optionsList, feedback);
    dialog.appendChild(qEl);
  });

  // Continue section — shown after all questions answered
  const continueSection = document.createElement("div");
  continueSection.style.cssText = `
    display: none;
    flex-direction: column;
    gap: 12px;
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid rgba(148, 163, 184, 0.15);
  `;

  const toggleLabel = document.createElement("label");
  toggleLabel.style.cssText = `display: flex; align-items: center; gap: 8px; color: #9ca3af; font-size: 1.02rem; cursor: pointer; user-select: none;`;

  const toggleInput = document.createElement("input");
  toggleInput.type = "checkbox";
  toggleInput.checked = state.autoResume;
  toggleInput.style.cssText = `accent-color: #38bdf8; cursor: pointer;`;
  toggleInput.addEventListener("change", () => {
    state.autoResume = toggleInput.checked;
  });
  toggleLabel.append(toggleInput, document.createTextNode(" " + t("auto_resume_label")));

  const continueBtn = document.createElement("button");
  continueBtn.textContent = t("continue_watching_btn");
  continueBtn.style.cssText = primaryBtnStyle();
  continueBtn.addEventListener("click", dismissAndResume);

  continueSection.append(toggleLabel, continueBtn);
  dialog.appendChild(continueSection);

  // Skip button — always visible from the start
  const skipRow = document.createElement("div");
  skipRow.style.cssText = `margin-top: 16px; text-align: right;`;
  const skipBtn = document.createElement("button");
  skipBtn.textContent = t("skip_quiz_btn");
  skipBtn.style.cssText = secondaryBtnStyle();
  skipBtn.addEventListener("click", dismissAndResume);
  skipRow.appendChild(skipBtn);
  dialog.appendChild(skipRow);

  dialog.appendChild(createCloseButton(dismissAndResume));
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
}

function primaryBtnStyle(): string {
  return `
    display: inline-block; padding: 10px 20px; border: none; border-radius: 999px;
    background: linear-gradient(135deg, #38bdf8, #a855f7); color: white;
    font-weight: 600; font-size: 1.14rem; cursor: pointer;
    box-shadow: 0 8px 20px rgba(56, 189, 248, 0.3);
  `;
}

function secondaryBtnStyle(): string {
  return `
    background: none; border: 1px solid rgba(148, 163, 184, 0.3);
    border-radius: 999px; color: #94a3b8; font-size: 1.02rem;
    padding: 6px 14px; cursor: pointer;
  `;
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  console.log("youtube-quiz: initializing");

  const settings = await loadSettings();

  setLocale(settings?.language ?? LOCALE_EN);
  state.intervalSeconds = (settings?.quizIntervalMinutes ?? 1) * 60;
  state.numQuestions = settings?.quizNumQuestions ?? 3;
  state.enabled = settings?.enabled ?? true;

  const video = await waitForVideo();
  console.log("youtube-quiz: video element found");

  // Auto-open transcript; fall back to badge if it fails or video has no captions
  if (!transcriptSegments) {
    void tryAutoOpenTranscript().then((success) => {
      if (!success && !transcriptSegments) showTranscriptBadge("pending");
    });
  }

  setupSeekDetection(video);

  if (state.timerId !== null) clearInterval(state.timerId);
  state.timerId = setInterval(onTimerTick, 500);

  scheduleNextQuiz(video.currentTime);
}

// React to settings changes (e.g. toggling enabled from the popup) without a page reload
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes[SETTINGS_KEY]) return;
  const newSettings = changes[SETTINGS_KEY].newValue as ExtensionSettings | undefined;
  if (newSettings) {
    setLocale(newSettings.language ?? LOCALE_EN);
    state.enabled = newSettings.enabled ?? true;
    state.intervalSeconds = (newSettings.quizIntervalMinutes ?? 1) * 60;
    state.numQuestions = newSettings.quizNumQuestions ?? 3;
    if (!state.enabled) {
      removeCountdown();
    }
  }
});

// Re-initialize on YouTube SPA navigation (video changes without full page reload)
window.addEventListener("yt-navigate-finish", () => {
  if (!window.location.pathname.startsWith("/watch")) return;
  console.log("youtube-quiz: SPA navigation detected, reinitializing");

  if (state.timerId !== null) clearInterval(state.timerId);
  removeCountdown();
  removeExistingDialog();
  document.getElementById("yt-quiz-transcript-badge")?.remove();
  transcriptSegments = null;
  state = freshState();

  void init();
});

void init();
