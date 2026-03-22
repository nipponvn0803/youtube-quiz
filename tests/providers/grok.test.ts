import { describe, it, expect, vi, afterEach } from "vitest";
import { generateQuizQuestions, listModels } from "../../src/providers/grok";
import { mockFetchOk, mockFetchError, SAMPLE_QUESTIONS_PAYLOAD } from "../helpers";

const PROMPT = "What did the video cover?";
const API_KEY = "xai-test-key";
const MODEL = "grok-4-1-fast";

afterEach(() => vi.unstubAllGlobals());

describe("grok.generateQuizQuestions", () => {
  it("parses a valid response into QuizQuestion[]", async () => {
    mockFetchOk({
      choices: [{ message: { content: JSON.stringify(SAMPLE_QUESTIONS_PAYLOAD) } }],
    });

    const questions = await generateQuizQuestions(PROMPT, API_KEY, MODEL);

    expect(questions).toHaveLength(1);
    expect(questions[0].text).toBe("What is the capital of France?");
    expect(questions[0].correctIndex).toBe(2);
    expect(questions[0].id).toBe("q-0");
  });

  it("calls the correct xAI endpoint with Bearer auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: JSON.stringify(SAMPLE_QUESTIONS_PAYLOAD) } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await generateQuizQuestions(PROMPT, API_KEY, MODEL);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.x.ai/v1/chat/completions");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(`Bearer ${API_KEY}`);
  });

  it("sends the model name and json_object response_format", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: JSON.stringify(SAMPLE_QUESTIONS_PAYLOAD) } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await generateQuizQuestions(PROMPT, API_KEY, MODEL);

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.model).toBe(MODEL);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("throws on a non-ok API response", async () => {
    mockFetchError(401, "Unauthorized");
    await expect(generateQuizQuestions(PROMPT, API_KEY, MODEL)).rejects.toThrow("401");
  });

  it("throws when choices are empty", async () => {
    mockFetchOk({ choices: [] });
    await expect(generateQuizQuestions(PROMPT, API_KEY, MODEL)).rejects.toThrow();
  });
});

describe("grok.listModels", () => {
  it("returns all model IDs sorted", async () => {
    mockFetchOk({
      data: [
        { id: "grok-4-1-fast" },
        { id: "grok-3" },
        { id: "grok-4" },
      ],
    });

    const models = await listModels(API_KEY);
    expect(models).toEqual(["grok-3", "grok-4", "grok-4-1-fast"]);
  });

  it("calls the xAI models endpoint with Bearer auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await listModels(API_KEY);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.x.ai/v1/models");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(`Bearer ${API_KEY}`);
  });

  it("throws on a non-ok response", async () => {
    mockFetchError(503, "Service unavailable");
    await expect(listModels(API_KEY)).rejects.toThrow("503");
  });
});
