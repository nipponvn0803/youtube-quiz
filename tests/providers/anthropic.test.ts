import { describe, it, expect, vi, afterEach } from "vitest";
import { generateQuizQuestions, listModels } from "../../src/providers/anthropic";
import { mockFetchOk, mockFetchError, SAMPLE_QUESTIONS_PAYLOAD } from "../helpers";

const PROMPT = "What did the video cover?";
const API_KEY = "sk-ant-test-key";
const MODEL = "claude-haiku-4-5-20251001";

afterEach(() => vi.unstubAllGlobals());

describe("anthropic.generateQuizQuestions", () => {
  it("parses a valid response into QuizQuestion[]", async () => {
    mockFetchOk({
      content: [{ type: "text", text: JSON.stringify(SAMPLE_QUESTIONS_PAYLOAD) }],
    });

    const questions = await generateQuizQuestions(PROMPT, API_KEY, MODEL);

    expect(questions).toHaveLength(1);
    expect(questions[0].text).toBe("What is the capital of France?");
    expect(questions[0].correctIndex).toBe(2);
    expect(questions[0].id).toBe("q-0");
  });

  it("parses JSON wrapped in markdown code fences", async () => {
    const fenced = "```json\n" + JSON.stringify(SAMPLE_QUESTIONS_PAYLOAD) + "\n```";
    mockFetchOk({ content: [{ type: "text", text: fenced }] });

    const questions = await generateQuizQuestions(PROMPT, API_KEY, MODEL);
    expect(questions).toHaveLength(1);
    expect(questions[0].correctIndex).toBe(2);
  });

  it("calls the correct Anthropic endpoint with required headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ type: "text", text: JSON.stringify(SAMPLE_QUESTIONS_PAYLOAD) }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await generateQuizQuestions(PROMPT, API_KEY, MODEL);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(headers["x-api-key"]).toBe(API_KEY);
    expect(headers["anthropic-version"]).toBeDefined();
  });

  it("throws on a non-ok API response", async () => {
    mockFetchError(401, "Invalid API key");
    await expect(generateQuizQuestions(PROMPT, API_KEY, MODEL)).rejects.toThrow("401");
  });

  it("throws when content array is empty", async () => {
    mockFetchOk({ content: [] });
    await expect(generateQuizQuestions(PROMPT, API_KEY, MODEL)).rejects.toThrow();
  });
});

describe("anthropic.listModels", () => {
  it("returns all model IDs sorted", async () => {
    mockFetchOk({
      data: [
        { id: "claude-opus-4-6" },
        { id: "claude-haiku-4-5-20251001" },
        { id: "claude-sonnet-4-6" },
      ],
    });

    const models = await listModels(API_KEY);
    expect(models).toEqual(["claude-haiku-4-5-20251001", "claude-opus-4-6", "claude-sonnet-4-6"]);
  });

  it("sends the API key and anthropic-version headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await listModels(API_KEY);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe("https://api.anthropic.com/v1/models");
    expect(headers["x-api-key"]).toBe(API_KEY);
    expect(headers["anthropic-version"]).toBeDefined();
  });

  it("throws on a non-ok response", async () => {
    mockFetchError(403, "Forbidden");
    await expect(listModels(API_KEY)).rejects.toThrow("403");
  });
});
