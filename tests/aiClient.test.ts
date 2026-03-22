import { describe, it, expect, vi, afterEach } from "vitest";
import { buildPrompt, generateQuizQuestions, listModels } from "../src/aiClient";
import { PROVIDER_GEMINI, PROVIDER_OPENAI, PROVIDER_ANTHROPIC, PROVIDER_GROK } from "../src/shared/types";

vi.mock("../src/providers/gemini",    () => ({ generateQuizQuestions: vi.fn(), listModels: vi.fn() }));
vi.mock("../src/providers/openai",    () => ({ generateQuizQuestions: vi.fn(), listModels: vi.fn() }));
vi.mock("../src/providers/anthropic", () => ({ generateQuizQuestions: vi.fn(), listModels: vi.fn() }));
vi.mock("../src/providers/grok",      () => ({ generateQuizQuestions: vi.fn(), listModels: vi.fn() }));

import * as gemini    from "../src/providers/gemini";
import * as openai    from "../src/providers/openai";
import * as anthropic from "../src/providers/anthropic";
import * as grok      from "../src/providers/grok";

const TRANSCRIPT = "The video is about photosynthesis.";
const API_KEY = "test-key";
const MODEL = "some-model";

afterEach(() => vi.clearAllMocks());

describe("buildPrompt", () => {
  it("includes the transcript", () => {
    const prompt = buildPrompt(TRANSCRIPT, 3);
    expect(prompt).toContain(TRANSCRIPT);
  });

  it("includes the requested number of questions", () => {
    const prompt = buildPrompt(TRANSCRIPT, 5);
    expect(prompt).toContain("5");
  });

  it("includes the expected JSON schema shape", () => {
    const prompt = buildPrompt(TRANSCRIPT, 3);
    expect(prompt).toContain("correctIndex");
    expect(prompt).toContain("explanation");
  });
});

describe("generateQuizQuestions — dispatch", () => {
  it("dispatches to gemini provider", async () => {
    await generateQuizQuestions(TRANSCRIPT, 3, API_KEY, MODEL, PROVIDER_GEMINI);
    expect(gemini.generateQuizQuestions).toHaveBeenCalledOnce();
    expect(openai.generateQuizQuestions).not.toHaveBeenCalled();
  });

  it("dispatches to openai provider", async () => {
    await generateQuizQuestions(TRANSCRIPT, 3, API_KEY, MODEL, PROVIDER_OPENAI);
    expect(openai.generateQuizQuestions).toHaveBeenCalledOnce();
    expect(gemini.generateQuizQuestions).not.toHaveBeenCalled();
  });

  it("dispatches to anthropic provider", async () => {
    await generateQuizQuestions(TRANSCRIPT, 3, API_KEY, MODEL, PROVIDER_ANTHROPIC);
    expect(anthropic.generateQuizQuestions).toHaveBeenCalledOnce();
  });

  it("dispatches to grok provider", async () => {
    await generateQuizQuestions(TRANSCRIPT, 3, API_KEY, MODEL, PROVIDER_GROK);
    expect(grok.generateQuizQuestions).toHaveBeenCalledOnce();
  });

  it("passes the built prompt, apiKey, and model to the provider", async () => {
    await generateQuizQuestions(TRANSCRIPT, 2, API_KEY, MODEL, PROVIDER_OPENAI);
    const [prompt, key, model] = (openai.generateQuizQuestions as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string, string];
    expect(prompt).toContain(TRANSCRIPT);
    expect(key).toBe(API_KEY);
    expect(model).toBe(MODEL);
  });

  it("throws for an unknown provider", async () => {
    await expect(
      generateQuizQuestions(TRANSCRIPT, 3, API_KEY, MODEL, "unknown" as never),
    ).rejects.toThrow("Unknown provider");
  });
});

describe("listModels — dispatch", () => {
  it("dispatches to gemini", async () => {
    await listModels(PROVIDER_GEMINI, API_KEY);
    expect(gemini.listModels).toHaveBeenCalledWith(API_KEY);
  });

  it("dispatches to openai", async () => {
    await listModels(PROVIDER_OPENAI, API_KEY);
    expect(openai.listModels).toHaveBeenCalledWith(API_KEY);
  });

  it("dispatches to anthropic", async () => {
    await listModels(PROVIDER_ANTHROPIC, API_KEY);
    expect(anthropic.listModels).toHaveBeenCalledWith(API_KEY);
  });

  it("dispatches to grok", async () => {
    await listModels(PROVIDER_GROK, API_KEY);
    expect(grok.listModels).toHaveBeenCalledWith(API_KEY);
  });

  it("throws for an unknown provider", async () => {
    await expect(listModels("unknown" as never, API_KEY)).rejects.toThrow("Unknown provider");
  });
});
