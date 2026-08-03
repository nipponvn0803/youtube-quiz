// Pure scheduling logic for the quiz timer, kept out of the content script so
// it can be unit-tested without a DOM.

export type TranscriptSegment = { startMs: number; text: string };

// Lead time used only when the transcript hasn't reached the end of the quiz
// window yet, so generation can't start early.
export const FALLBACK_PREGEN_LEAD_SECONDS = 20;

export interface QuizWindow {
  // Start of the transcript range the next quiz draws from
  checkpointSeconds: number;
  // Video time the quiz appears at, and the end of that range
  quizVideoTime: number;
}

// Gap between two video positions that playback alone can't account for, so it
// has to be a seek. Well above what a single timer tick can cover, even at 2x.
export const SEEK_RESCHEDULE_THRESHOLD_SECONDS = 15;

export function isSignificantJump(
  fromVideoTime: number,
  toVideoTime: number,
  thresholdSeconds = SEEK_RESCHEDULE_THRESHOLD_SECONDS,
): boolean {
  return Math.abs(toVideoTime - fromVideoTime) > thresholdSeconds;
}

// A reschedule (first play, seek, skip, or a dismissed quiz) always moves both
// ends: the window covers exactly one interval of playback from `fromVideoTime`.
export function nextQuizWindow(fromVideoTime: number, intervalSeconds: number): QuizWindow {
  return {
    checkpointSeconds: fromVideoTime,
    quizVideoTime: fromVideoTime + intervalSeconds,
  };
}

export function getTranscriptUpTo(
  segments: TranscriptSegment[] | null,
  upToSeconds: number,
  fromSeconds = 0,
): string | null {
  if (!segments) return null;
  const upToMs = upToSeconds * 1000;
  const fromMs = fromSeconds * 1000;
  const lines: string[] = [];
  for (const seg of segments) {
    if (seg.startMs > upToMs) break;
    if (seg.startMs < fromMs) continue;
    lines.push(seg.text);
  }
  return lines.length ? lines.join(" ") : null;
}

// YouTube hands us the whole transcript at once, so the text for an upcoming
// quiz window is usually cached long before playback reaches it. Rolling
// caption chunks (timedtext) can arrive partial, though, so check we actually
// have segments past the point we want before generating from that window.
export function transcriptReachesSecond(
  segments: TranscriptSegment[] | null,
  seconds: number,
): boolean {
  const last = segments?.[segments.length - 1];
  return !!last && last.startMs >= seconds * 1000;
}

// Start pre-generating as soon as the transcript covers the whole upcoming quiz
// window — typically right after the previous quiz — so a slow model (notably
// on-device) has the full interval to finish instead of a few seconds. If the
// transcript is still partial (or the video ends inside the window), fall back
// to a short lead and generate from what we have.
export function shouldPreGenerate(args: {
  alreadyTriggered: boolean;
  segments: TranscriptSegment[] | null;
  quizVideoTime: number;
  currentTime: number;
}): boolean {
  if (args.alreadyTriggered) return false;
  if (transcriptReachesSecond(args.segments, args.quizVideoTime)) return true;
  return args.quizVideoTime - args.currentTime <= FALLBACK_PREGEN_LEAD_SECONDS;
}
