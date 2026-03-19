import {
  QuizQuestion,
  QuizRequestMessage,
  QuizResponseMessage,
} from "./shared/types";

// ---------------------------------------------------------------------------
// Transcript helpers
// ---------------------------------------------------------------------------

function getVideoId(): string | null {
  return new URLSearchParams(window.location.search).get("v");
}

function getCurrentTimeSeconds(): number {
  return document.querySelector<HTMLVideoElement>("video")?.currentTime ?? 0;
}

// Populated by the yt-quiz-transcript-data event forwarded from youtubeInterceptor.ts
type RawNode = Record<string, unknown>;
let latestTranscriptResponse: RawNode | null = null;

window.addEventListener("yt-quiz-transcript-data", (event) => {
  latestTranscriptResponse = (event as CustomEvent<RawNode>).detail;
  console.log("youtube-quiz: transcript response cached");
});

function fetchTranscriptUpTo(upToSeconds: number): string {
  if (!latestTranscriptResponse) {
    throw new Error(
      "No transcript loaded — please open the transcript panel first (click '...' → 'Show transcript')",
    );
  }

  const segments = (
    (
      (
        (
          (
            ((latestTranscriptResponse.actions as RawNode[] | undefined)?.[0]
              ?.updateEngagementPanelAction as RawNode)
              ?.content as RawNode
          )?.transcriptRenderer as RawNode
        )?.content as RawNode
      )?.transcriptSearchPanelRenderer as RawNode
    )?.body as RawNode
  )?.transcriptSegmentListRenderer as RawNode | undefined;

  const initialSegments = segments?.initialSegments as RawNode[] | undefined;
  if (!initialSegments?.length) {
    throw new Error("Transcript response contained no segments");
  }

  const upToMs = upToSeconds * 1000;
  const lines: string[] = [];

  for (const seg of initialSegments) {
    const renderer = seg.transcriptSegmentRenderer as RawNode | undefined;
    if (!renderer) continue;
    if (Number(renderer.startMs ?? 0) > upToMs) break;
    const runs = (renderer.snippet as RawNode | undefined)
      ?.runs as Array<{ text: string }> | undefined;
    const text = runs?.map((r) => r.text).join("").trim();
    if (text) lines.push(text);
  }

  if (!lines.length) {
    throw new Error("Transcript is empty up to this point in the video");
  }
  return lines.join(" ");
}

// ---------------------------------------------------------------------------
// Dialog helpers
// ---------------------------------------------------------------------------

function removeExistingDialog(): void {
  document.getElementById("yt-quiz-overlay")?.remove();
}

function createOverlay(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.id = "yt-quiz-overlay";
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999999;
    font-family: system-ui, -apple-system, sans-serif;
  `;
  return overlay;
}

function createDialog(): HTMLDivElement {
  const dialog = document.createElement("div");
  dialog.style.cssText = `
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
  return dialog;
}

function makeContinueBtn(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = "Continue watching →";
  btn.style.cssText = `
    display: block;
    margin-top: 20px;
    padding: 10px 20px;
    border: none;
    border-radius: 999px;
    background: linear-gradient(135deg, #38bdf8, #a855f7);
    color: white;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    box-shadow: 0 8px 20px rgba(56, 189, 248, 0.3);
  `;
  btn.addEventListener("click", () => {
    removeExistingDialog();
    document.querySelector<HTMLVideoElement>("video")?.play();
  });
  return btn;
}

function showLoadingDialog(): void {
  removeExistingDialog();
  const overlay = createOverlay();
  const dialog = createDialog();

  const title = document.createElement("p");
  title.textContent = "Quick Quiz";
  title.style.cssText = `margin: 0 0 16px; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #38bdf8;`;

  const msg = document.createElement("p");
  msg.textContent = "Generating your quiz…";
  msg.style.cssText = `margin: 0; font-size: 1rem; color: #9ca3af;`;

  dialog.append(title, msg);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
}

function showErrorDialog(message: string): void {
  removeExistingDialog();
  const overlay = createOverlay();
  const dialog = createDialog();

  const title = document.createElement("p");
  title.textContent = "Quick Quiz";
  title.style.cssText = `margin: 0 0 12px; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #38bdf8;`;

  const msg = document.createElement("p");
  msg.textContent = `Could not generate quiz: ${message}`;
  msg.style.cssText = `margin: 0 0 4px; font-size: 0.95rem; color: #f97373;`;

  dialog.append(title, msg, makeContinueBtn());
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
}

function showQuizDialog(questions: QuizQuestion[]): void {
  removeExistingDialog();
  const overlay = createOverlay();
  const dialog = createDialog();

  const title = document.createElement("p");
  title.textContent = "Quick Quiz";
  title.style.cssText = `margin: 0 0 24px; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #38bdf8;`;
  dialog.appendChild(title);

  let answeredCount = 0;
  const continueBtn = makeContinueBtn();
  continueBtn.style.display = "none";

  questions.forEach((q, qIdx) => {
    const qEl = document.createElement("div");
    if (qIdx > 0) qEl.style.marginTop = "28px";

    const qText = document.createElement("p");
    qText.textContent = `${qIdx + 1}. ${q.text}`;
    qText.style.cssText = `margin: 0 0 14px; font-size: 1rem; font-weight: 600; line-height: 1.5;`;

    const optionsList = document.createElement("div");
    optionsList.style.cssText = `display: flex; flex-direction: column; gap: 8px;`;

    const feedback = document.createElement("p");
    feedback.style.cssText = `margin: 10px 0 0; font-size: 0.85rem; min-height: 1em;`;

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
        font-size: 0.9rem;
        cursor: pointer;
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
          ? "Correct!"
          : `Incorrect. ${q.explanation ?? `Answer: "${q.options[q.correctIndex].text}"`}`;
        feedback.style.color = isCorrect ? "#4ade80" : "#f97373";

        if (answeredCount === questions.length) {
          continueBtn.style.display = "block";
        }
      });

      optionsList.appendChild(btn);
      return btn;
    });

    qEl.append(qText, optionsList, feedback);
    dialog.appendChild(qEl);
  });

  dialog.appendChild(continueBtn);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
}

// ---------------------------------------------------------------------------
// Message listener
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "PAUSE_VIDEO") {
    console.log("youtube-quiz: pause video");

    const video = document.querySelector<HTMLVideoElement>("video");
    if (video && !video.paused) {
      video.pause();
    }

    const videoId = getVideoId();
    if (!videoId) {
      showErrorDialog("Could not determine video ID.");
      return;
    }

    const currentTime = getCurrentTimeSeconds();
    showLoadingDialog();

    void (async () => {
      let transcript: string;
      try {
        transcript = fetchTranscriptUpTo(currentTime);
      } catch (err) {
        showErrorDialog(err instanceof Error ? err.message : String(err));
        return;
      }

      const request: QuizRequestMessage = {
        type: "REQUEST_QUIZ",
        videoId,
        videoUrl: window.location.href,
        transcript,
        currentTimeSeconds: currentTime,
        numQuestions: 3,
      };

      const response = (await chrome.runtime.sendMessage(
        request,
      )) as QuizResponseMessage;

      if (response.type === "QUIZ_SUCCESS") {
        showQuizDialog(response.questions);
      } else {
        showErrorDialog(response.error);
      }
    })();
  }
});
