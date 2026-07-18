// Runs in the page's MAIN world so it can patch window.fetch and XMLHttpRequest.
// Forwards transcript-bearing responses to the isolated content script
// via a CustomEvent on window (DOM events cross the world boundary).
//
// YouTube delivers transcript/caption data through several endpoints:
//  - /youtubei/v1/get_transcript  — transcript panel (classic path)
//  - /youtubei/v1/get_panel       — generic panel loader; some videos get the
//                                   transcript panel through it instead
//  - /api/timedtext               — caption files the player fetches when CC is on
// The content script parses each shape; here we only match and forward.

const TRANSCRIPT_ENDPOINTS = [
  { pattern: "/youtubei/v1/get_transcript", endpoint: "get_transcript" },
  { pattern: "/youtubei/v1/get_panel", endpoint: "get_panel" },
  { pattern: "/api/timedtext", endpoint: "timedtext" },
] as const;

type TranscriptEndpoint = (typeof TRANSCRIPT_ENDPOINTS)[number]["endpoint"];

function matchTranscriptEndpoint(url: string): TranscriptEndpoint | null {
  for (const { pattern, endpoint } of TRANSCRIPT_ENDPOINTS) {
    if (url.includes(pattern)) return endpoint;
  }
  return null;
}

function dispatchTranscriptData(endpoint: TranscriptEndpoint, data: unknown): void {
  window.dispatchEvent(
    new CustomEvent("yt-quiz-transcript-data", { detail: { endpoint, data } }),
  );
}

const originalFetch = window.fetch.bind(window);

window.fetch = async function (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await originalFetch(input, init);

  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;

  const endpoint = matchTranscriptEndpoint(url);
  if (endpoint) {
    response
      .clone()
      .json()
      .then((data: unknown) => dispatchTranscriptData(endpoint, data))
      .catch(() => {}); // non-JSON (e.g. XML timedtext) — ignore
  }

  return response;
};

// The player has historically fetched /api/timedtext via XHR, so cover it too.
const xhrUrls = new WeakMap<XMLHttpRequest, string>();

const originalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (
  this: XMLHttpRequest,
  ...args: [method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null]
): void {
  xhrUrls.set(this, String(args[1]));
  originalOpen.apply(this, args as Parameters<XMLHttpRequest["open"]>);
};

const originalSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send = function (
  this: XMLHttpRequest,
  body?: Document | XMLHttpRequestBodyInit | null,
): void {
  const url = xhrUrls.get(this);
  const endpoint = url ? matchTranscriptEndpoint(url) : null;
  if (endpoint) {
    this.addEventListener("load", () => {
      try {
        const data: unknown =
          this.responseType === "json"
            ? this.response
            : JSON.parse(this.responseText);
        if (data) dispatchTranscriptData(endpoint, data);
      } catch {
        // non-JSON response, or responseText unavailable for this responseType
      }
    });
  }
  originalSend.call(this, body);
};
