import { describe, it, expect } from "vitest";
import {
  FALLBACK_PREGEN_LEAD_SECONDS,
  SEEK_RESCHEDULE_THRESHOLD_SECONDS,
  TranscriptSegment,
  getTranscriptUpTo,
  isSignificantJump,
  nextQuizWindow,
  shouldPreGenerate,
  transcriptReachesSecond,
} from "../../src/shared/quizScheduling";

// One segment every 30s of a 20-minute video, mimicking the full transcript
// YouTube hands over in a single response.
function fullTranscript(durationSeconds = 1200): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  for (let s = 0; s < durationSeconds; s += 30) {
    segments.push({ startMs: s * 1000, text: `line at ${s}s` });
  }
  return segments;
}

describe("nextQuizWindow", () => {
  it("spans exactly one interval from the reschedule point", () => {
    expect(nextQuizWindow(300, 300)).toEqual({ checkpointSeconds: 300, quizVideoTime: 600 });
  });

  // The checkpoint used to move only when a quiz was dismissed, so a seek left
  // the window start behind and the range grew past a single interval.
  it("moves the window start on a mid-interval reschedule such as a seek", () => {
    const afterSeek = nextQuizWindow(455, 300);

    expect(afterSeek.checkpointSeconds).toBe(455);
    expect(afterSeek.quizVideoTime).toBe(755);
  });

  it("keeps the window forward-looking when the viewer seeks backwards", () => {
    const afterRewind = nextQuizWindow(120, 300);

    expect(afterRewind.checkpointSeconds).toBeLessThan(afterRewind.quizVideoTime);
  });
});

describe("isSignificantJump", () => {
  it("ignores the drift of ordinary playback between ticks", () => {
    expect(isSignificantJump(300, 300.5)).toBe(false);
    // Even 2x playback covers only ~1s per 500ms tick
    expect(isSignificantJump(300, 301)).toBe(false);
  });

  it("catches a long forward skip", () => {
    // The reported case: the timer tick sees the new position before `seeked`
    // fires, so this is the only thing standing between a 3-minute skip and a
    // quiz firing for the window that was skipped over.
    expect(isSignificantJump(300, 480)).toBe(true);
  });

  it("catches a rewind just the same", () => {
    expect(isSignificantJump(480, 300)).toBe(true);
  });

  it("treats the threshold itself as ordinary playback", () => {
    const from = 300;
    expect(isSignificantJump(from, from + SEEK_RESCHEDULE_THRESHOLD_SECONDS)).toBe(false);
    expect(isSignificantJump(from, from + SEEK_RESCHEDULE_THRESHOLD_SECONDS + 0.1)).toBe(true);
  });
});

describe("getTranscriptUpTo", () => {
  it("returns null when no transcript has arrived", () => {
    expect(getTranscriptUpTo(null, 600, 300)).toBeNull();
  });

  it("includes only segments inside the window", () => {
    const segments: TranscriptSegment[] = [
      { startMs: 0, text: "before" },
      { startMs: 300_000, text: "start" },
      { startMs: 450_000, text: "middle" },
      { startMs: 600_000, text: "end" },
      { startMs: 630_000, text: "after" },
    ];

    expect(getTranscriptUpTo(segments, 600, 300)).toBe("start middle end");
  });

  it("covers the full upcoming interval, not just what has played so far", () => {
    const segments = fullTranscript();

    // Pre-generation at 5:01 for a quiz due at 10:00 must already include the
    // 9:30 line, even though playback is nowhere near it.
    const window = getTranscriptUpTo(segments, 600, 300);

    expect(window).toContain("line at 570s");
    expect(window).not.toContain("line at 270s");
    expect(window).not.toContain("line at 630s");
  });

  it("returns null when the window contains no segments", () => {
    expect(getTranscriptUpTo(fullTranscript(120), 600, 300)).toBeNull();
  });
});

describe("transcriptReachesSecond", () => {
  it("is false without a transcript", () => {
    expect(transcriptReachesSecond(null, 600)).toBe(false);
    expect(transcriptReachesSecond([], 600)).toBe(false);
  });

  it("is true once a segment starts at or after the target second", () => {
    expect(transcriptReachesSecond([{ startMs: 600_000, text: "x" }], 600)).toBe(true);
  });

  it("is false while the cached transcript still ends before the target", () => {
    expect(transcriptReachesSecond([{ startMs: 599_000, text: "x" }], 600)).toBe(false);
  });
});

describe("shouldPreGenerate", () => {
  const segments = fullTranscript();

  it("fires immediately after a reschedule when the transcript covers the window", () => {
    // 5-minute interval: quiz due at 10:00, playback just past the 5:00 checkpoint.
    expect(
      shouldPreGenerate({
        alreadyTriggered: false,
        segments,
        quizVideoTime: 600,
        currentTime: 301,
      }),
    ).toBe(true);
  });

  it("fires at the very start of a 1-minute interval instead of waiting for the old 20s lead", () => {
    expect(
      shouldPreGenerate({
        alreadyTriggered: false,
        segments,
        quizVideoTime: 60,
        currentTime: 0,
      }),
    ).toBe(true);
  });

  it("does not fire twice for the same window", () => {
    expect(
      shouldPreGenerate({
        alreadyTriggered: true,
        segments,
        quizVideoTime: 600,
        currentTime: 301,
      }),
    ).toBe(false);
  });

  it("waits while the transcript is still partial and the quiz is far off", () => {
    // Rolling captions have only reached 6:00 of a window ending at 10:00.
    expect(
      shouldPreGenerate({
        alreadyTriggered: false,
        segments: fullTranscript(360),
        quizVideoTime: 600,
        currentTime: 301,
      }),
    ).toBe(false);
  });

  it("falls back to the short lead when the transcript never covers the window", () => {
    const partial = fullTranscript(360);
    const quizVideoTime = 600;

    expect(
      shouldPreGenerate({
        alreadyTriggered: false,
        segments: partial,
        quizVideoTime,
        currentTime: quizVideoTime - FALLBACK_PREGEN_LEAD_SECONDS - 1,
      }),
    ).toBe(false);

    expect(
      shouldPreGenerate({
        alreadyTriggered: false,
        segments: partial,
        quizVideoTime,
        currentTime: quizVideoTime - FALLBACK_PREGEN_LEAD_SECONDS,
      }),
    ).toBe(true);
  });

  it("still falls back when no transcript has arrived at all", () => {
    expect(
      shouldPreGenerate({
        alreadyTriggered: false,
        segments: null,
        quizVideoTime: 600,
        currentTime: 590,
      }),
    ).toBe(true);
  });
});
