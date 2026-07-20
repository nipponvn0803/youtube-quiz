import { describe, it, expect } from "vitest";
import {
  RawNode,
  extractInnerTubeSegments,
  extractTimelineSegments,
  extractTimedtextSegments,
} from "../../src/shared/transcriptParsing";

// Simplified get_panel response for the newer "modern transcript view" panel
// (panelId PAmodern_transcript_view), mirroring the real shape: a leading
// chapter header, then transcript segments carried as macroMarkersPanelItemView-
// Model -> timelineItemViewModel -> transcriptSegmentViewModel.simpleText, with
// the numeric time on watchEndpoint.startTimeSeconds.
const timelinePanel: RawNode = {
  content: {
    engagementPanelSectionListRenderer: {
      header: {
        engagementPanelTitleHeaderRenderer: { title: { runs: [{ text: "Transcript" }] } },
      },
      content: {
        sectionListRenderer: {
          contents: [
            // Chapter header — no timelineItemViewModel; must be skipped.
            {
              itemSectionRenderer: {
                header: {
                  macroMarkersPanelItemViewModel: {
                    item: { timelineChapterViewModel: { title: "Chapter 1", index: 0 } },
                    index: 0,
                    panelId: "PAmodern_transcript_view",
                  },
                },
              },
            },
            {
              itemSectionRenderer: {
                contents: [
                  {
                    macroMarkersPanelItemViewModel: {
                      item: {
                        timelineItemViewModel: {
                          timestamp: "0:10",
                          contentItems: [
                            {
                              transcriptSegmentViewModel: {
                                simpleText: "Hello các bạn",
                                timestamp: "0:10",
                              },
                            },
                          ],
                        },
                      },
                      onTap: { innertubeCommand: { watchEndpoint: { startTimeSeconds: 10 } } },
                    },
                  },
                  {
                    macroMarkersPanelItemViewModel: {
                      item: {
                        timelineItemViewModel: {
                          timestamp: "1:03",
                          contentItems: [
                            {
                              transcriptSegmentViewModel: {
                                simpleText: "cuộc giao tiếp",
                                timestamp: "1:03",
                              },
                            },
                          ],
                        },
                      },
                      onTap: { innertubeCommand: { watchEndpoint: { startTimeSeconds: 63 } } },
                    },
                  },
                  // playerParams present alongside startTimeSeconds — still read seconds.
                  {
                    macroMarkersPanelItemViewModel: {
                      item: {
                        timelineItemViewModel: {
                          timestamp: "1:12",
                          contentItems: [
                            {
                              transcriptSegmentViewModel: {
                                simpleText: "khởi đầu mới",
                                timestamp: "1:12",
                              },
                            },
                          ],
                        },
                      },
                      onTap: {
                        innertubeCommand: {
                          watchEndpoint: { startTimeSeconds: 72, playerParams: "0gcJ" },
                        },
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    },
  },
};

describe("extractTimelineSegments (modern transcript view)", () => {
  it("extracts segments in order with startMs from watchEndpoint.startTimeSeconds", () => {
    expect(extractTimelineSegments(timelinePanel)).toEqual([
      { startMs: 10_000, text: "Hello các bạn" },
      { startMs: 63_000, text: "cuộc giao tiếp" },
      { startMs: 72_000, text: "khởi đầu mới" },
    ]);
  });

  it("skips chapter headers (timelineChapterViewModel has no transcript text)", () => {
    const segments = extractTimelineSegments(timelinePanel);
    expect(segments?.map((s) => s.text)).not.toContain("Chapter 1");
    expect(segments).toHaveLength(3);
  });

  it("falls back to the display timestamp when there is no watchEndpoint", () => {
    const noWatch: RawNode = {
      macroMarkersPanelItemViewModel: {
        item: {
          timelineItemViewModel: {
            timestamp: "1:02:03", // h:mm:ss
            contentItems: [{ transcriptSegmentViewModel: { simpleText: "fallback" } }],
          },
        },
      },
    };
    // 1h 2m 3s = 3723s
    expect(extractTimelineSegments(noWatch)).toEqual([{ startMs: 3_723_000, text: "fallback" }]);
  });

  it("joins multiple contentItems in a single timeline item", () => {
    const multi: RawNode = {
      macroMarkersPanelItemViewModel: {
        item: {
          timelineItemViewModel: {
            timestamp: "0:05",
            contentItems: [
              { transcriptSegmentViewModel: { simpleText: "part one" } },
              { transcriptSegmentViewModel: { simpleText: "part two" } },
            ],
          },
        },
        onTap: { innertubeCommand: { watchEndpoint: { startTimeSeconds: 5 } } },
      },
    };
    expect(extractTimelineSegments(multi)).toEqual([
      { startMs: 5_000, text: "part one part two" },
    ]);
  });

  it("returns null when there are no timeline view-models", () => {
    expect(extractTimelineSegments({ foo: "bar" })).toBeNull();
  });
});

describe("extractInnerTubeSegments", () => {
  // Classic get_transcript/get_panel shape.
  const classicPanel: RawNode = {
    actions: [
      {
        updateEngagementPanelAction: {
          content: {
            transcriptRenderer: {
              content: {
                transcriptSearchPanelRenderer: {
                  body: {
                    transcriptSegmentListRenderer: {
                      initialSegments: [
                        {
                          transcriptSectionHeaderRenderer: { startMs: "0" }, // chapter — skipped
                        },
                        {
                          transcriptSegmentRenderer: {
                            startMs: "0",
                            snippet: { runs: [{ text: "first " }, { text: "line" }] },
                          },
                        },
                        {
                          transcriptSegmentRenderer: {
                            startMs: "5000",
                            snippet: { runs: [{ text: "second line" }] },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
    ],
  };

  it("parses the classic transcriptSegmentListRenderer shape", () => {
    expect(extractInnerTubeSegments(classicPanel)).toEqual([
      { startMs: 0, text: "first line" },
      { startMs: 5000, text: "second line" },
    ]);
  });

  it("falls back to the timeline shape when there is no transcriptSegmentListRenderer", () => {
    expect(extractInnerTubeSegments(timelinePanel)).toEqual([
      { startMs: 10_000, text: "Hello các bạn" },
      { startMs: 63_000, text: "cuộc giao tiếp" },
      { startMs: 72_000, text: "khởi đầu mới" },
    ]);
  });

  it("returns null for a non-transcript panel (neither shape present)", () => {
    expect(extractInnerTubeSegments({ content: { commentsRenderer: {} } })).toBeNull();
  });
});

describe("extractTimedtextSegments", () => {
  it("parses json3 events and skips marker events without segs", () => {
    const data: RawNode = {
      events: [
        { tStartMs: 0 }, // window/styling marker, no segs
        { tStartMs: 1000, segs: [{ utf8: "hello" }, { utf8: " world" }] },
        { tStartMs: 2000, segs: [{ utf8: "\n" }] }, // whitespace-only — dropped
        { tStartMs: 3000, segs: [{ utf8: "next  line" }] },
      ],
    };
    expect(extractTimedtextSegments(data)).toEqual([
      { startMs: 1000, text: "hello world" },
      { startMs: 3000, text: "next line" },
    ]);
  });

  it("returns null when there are no events", () => {
    expect(extractTimedtextSegments({})).toBeNull();
  });
});
