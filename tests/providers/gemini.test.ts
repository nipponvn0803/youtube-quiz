import { describe, it, expect, vi, afterEach } from "vitest";
import { generateQuizQuestions, listModels } from "../../src/providers/gemini";
import { mockFetchOk, mockFetchError, SAMPLE_QUESTIONS_PAYLOAD } from "../helpers";

const PROMPT = "What did the video cover?";
const API_KEY = "test-gemini-key";
const MODEL = "gemini-2.0-flash";

afterEach(() => vi.unstubAllGlobals());

describe("gemini.generateQuizQuestions", () => {
  it("parses a valid response into QuizQuestion[]", async () => {
    mockFetchOk({
      candidates: [{ content: { parts: [{ text: JSON.stringify(SAMPLE_QUESTIONS_PAYLOAD) }] } }],
    });

    const questions = await generateQuizQuestions(PROMPT, API_KEY, MODEL);

    expect(questions).toHaveLength(1);
    expect(questions[0].text).toBe("What is the capital of France?");
    expect(questions[0].options).toHaveLength(4);
    expect(questions[0].correctIndex).toBe(2);
    expect(questions[0].explanation).toBe("Paris is the capital of France.");
    expect(questions[0].id).toBe("q-0");
  });

  it("calls the correct Gemini endpoint with the model name", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: JSON.stringify(SAMPLE_QUESTIONS_PAYLOAD) }] } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await generateQuizQuestions(PROMPT, API_KEY, MODEL);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(MODEL);
    expect(url).toContain("generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(API_KEY);
  });

  it("throws on a non-ok API response", async () => {
    mockFetchError(403, "API key invalid");
    await expect(generateQuizQuestions(PROMPT, API_KEY, MODEL)).rejects.toThrow("403");
  });

  it("throws when the response has no candidates", async () => {
    mockFetchOk({ candidates: [] });
    await expect(generateQuizQuestions(PROMPT, API_KEY, MODEL)).rejects.toThrow();
  });
});

describe("gemini.listModels", () => {
  it("returns only models that support generateContent, with prefix stripped", async () => {
    mockFetchOk({
      models: [
        { name: "models/gemini-2.0-flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/embedding-001",    supportedGenerationMethods: ["embedContent"] },
        { name: "models/gemini-1.5-pro",   supportedGenerationMethods: ["generateContent", "countTokens"] },
      ],
    });

    const models = await listModels(API_KEY);
    expect(models).toEqual(["gemini-1.5-pro", "gemini-2.0-flash"]);
  });

  it("throws on a non-ok response", async () => {
    mockFetchError(401, "Unauthorized");
    await expect(listModels(API_KEY)).rejects.toThrow("401");
  });

  it("passes the API key as a query parameter", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ models: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await listModels(API_KEY);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain(`key=${API_KEY}`);
  });
});
