// Runs in the page's MAIN world so it can patch window.fetch.
// Forwards get_transcript responses to the isolated content script
// via a CustomEvent on window (DOM events cross the world boundary).

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

  if (url.includes("get_transcript")) {
    response
      .clone()
      .json()
      .then((data: unknown) => {
        window.dispatchEvent(
          new CustomEvent("yt-quiz-transcript-data", { detail: data }),
        );
      })
      .catch(() => {});
  }

  return response;
};
