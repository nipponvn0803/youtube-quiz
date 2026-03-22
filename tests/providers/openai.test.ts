import { describe, it, expect, vi, afterEach } from "vitest";
import { generateQuizQuestions, listModels } from "../../src/providers/openai";
import { mockFetchOk, mockFetchError, SAMPLE_QUESTIONS_PAYLOAD } from "../helpers";

const PROMPT = "What did the video cover?";
const API_KEY = "sk-test-key";
const MODEL = "gpt-4o-mini";

afterEach(() => vi.unstubAllGlobals());

describe("openai.generateQuizQuestions", () => {
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

  it("calls the correct OpenAI endpoint with Bearer auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: JSON.stringify(SAMPLE_QUESTIONS_PAYLOAD) } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await generateQuizQuestions(PROMPT, API_KEY, MODEL);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(`Bearer ${API_KEY}`);
  });

  it("sends the model name in the request body", async () => {
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
    mockFetchError(401, "Incorrect API key");
    await expect(generateQuizQuestions(PROMPT, API_KEY, MODEL)).rejects.toThrow("401");
  });

  it("throws when choices are empty", async () => {
    mockFetchOk({ choices: [] });
    await expect(generateQuizQuestions(PROMPT, API_KEY, MODEL)).rejects.toThrow();
  });
});

describe("openai.listModels", () => {
  it("returns only gpt- / o1 / o3 model IDs, sorted", async () => {
    mockFetchOk({
      data: [
        { id: "gpt-4o-mini" },
        { id: "gpt-4o" },
        { id: "whisper-1" },
        { id: "dall-e-3" },
        { id: "o1-mini" },
      ],
    });

    const models = await listModels(API_KEY);
    expect(models).toEqual(["gpt-4o", "gpt-4o-mini", "o1-mini"]);
  });

  it("throws on a non-ok response", async () => {
    mockFetchError(403, "Forbidden");
    await expect(listModels(API_KEY)).rejects.toThrow("403");
  });
});
