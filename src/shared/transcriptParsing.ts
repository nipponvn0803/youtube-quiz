// Pure transcript extraction, kept out of the content script so it can be
// unit-tested without a DOM. YouTube delivers transcript data through several
// endpoints and reshuffles the shapes over time, so each parser is written to
// search for the data rather than hard-code a path.

import { TranscriptSegment } from "./quizScheduling";

export type RawNode = Record<string, unknown>;

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

export function extractInnerTubeSegments(data: RawNode): TranscriptSegment[] | null {
  const initialSegments = findInitialSegments(data);
  if (initialSegments) {
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
    if (out.length) return out;
  }

  // Newer "modern transcript view" panel (panelId PAmodern_transcript_view) has
  // no transcriptSegmentListRenderer at all — fall back to its timeline shape.
  return extractTimelineSegments(data);
}

// Collect every object nested under `key`, recursively, in document order.
function collectByKey(node: unknown, key: string, out: RawNode[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectByKey(item, key, out);
    return;
  }
  const obj = node as RawNode;
  const match = obj[key];
  if (match && typeof match === "object") out.push(match as RawNode);
  for (const value of Object.values(obj)) collectByKey(value, key, out);
}

// "0:10", "1:03", "1:02:03" (h:mm:ss) -> seconds. null if not parseable.
function parseTimestamp(ts: string): number | null {
  const parts = ts.split(":").map(Number);
  if (!parts.length || parts.some((n) => Number.isNaN(n))) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

// Modern transcript view: segments arrive as macroMarkersPanelItemViewModel
// entries wrapping a timelineItemViewModel whose transcriptSegmentViewModel
// carries the text as `simpleText`. Chapter headers use timelineChapterViewModel
// (no timelineItemViewModel) and are skipped. There is no startMs here — the
// clean numeric time source is the tap target's watchEndpoint.startTimeSeconds
// (seconds), with the "m:ss" display timestamp as a fallback.
export function extractTimelineSegments(data: RawNode): TranscriptSegment[] | null {
  const items: RawNode[] = [];
  collectByKey(data, "macroMarkersPanelItemViewModel", items);
  if (!items.length) return null;

  const out: TranscriptSegment[] = [];
  for (const vm of items) {
    const timelineItem = (vm.item as RawNode | undefined)?.timelineItemViewModel as
      | RawNode
      | undefined;
    if (!timelineItem) continue; // chapter header or non-transcript item

    const contentItems = timelineItem.contentItems as RawNode[] | undefined;
    if (!Array.isArray(contentItems)) continue;

    const text = contentItems
      .map((ci) => (ci.transcriptSegmentViewModel as RawNode | undefined)?.simpleText)
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .join(" ")
      .trim();
    if (!text) continue;

    out.push({ startMs: timelineStartMs(vm, timelineItem), text });
  }
  return out.length ? out : null;
}

function timelineStartMs(vm: RawNode, timelineItem: RawNode): number {
  const watch = ((vm.onTap as RawNode | undefined)?.innertubeCommand as RawNode | undefined)
    ?.watchEndpoint as RawNode | undefined;
  const secs = watch?.startTimeSeconds;
  if (typeof secs === "number") return secs * 1000;

  const display = timelineItem.timestamp;
  if (typeof display === "string") {
    const parsed = parseTimestamp(display);
    if (parsed !== null) return parsed * 1000;
  }
  return 0;
}

// timedtext json3 shape: { events: [{ tStartMs, segs: [{ utf8 }] }] }
// Events without segs are styling/window markers; newline-only segs separate
// rolling caption lines.
export function extractTimedtextSegments(data: RawNode): TranscriptSegment[] | null {
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
