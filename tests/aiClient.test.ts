import { describe, it, expect, vi, afterEach } from "vitest";
import { buildPrompt, generateQuizQuestions, listModels } from "../src/aiClient";
import { PROVIDER_GEMINI, PROVIDER_OPENAI, PROVIDER_ANTHROPIC, PROVIDER_GROK, PROVIDER_DEEPSEEK, PROVIDER_ONDEVICE } from "../src/shared/types";

vi.mock("../src/providers/gemini",    () => ({ generateQuizQuestions: vi.fn(), listModels: vi.fn() }));
vi.mock("../src/providers/openai",    () => ({ generateQuizQuestions: vi.fn(), listModels: vi.fn() }));
vi.mock("../src/providers/anthropic", () => ({ generateQuizQuestions: vi.fn(), listModels: vi.fn() }));
vi.mock("../src/providers/grok",      () => ({ generateQuizQuestions: vi.fn(), listModels: vi.fn() }));
vi.mock("../src/providers/deepseek",  () => ({ generateQuizQuestions: vi.fn(), listModels: vi.fn() }));
vi.mock("../src/providers/ondevice",  () => ({ generateQuizQuestions: vi.fn() }));

import * as gemini    from "../src/providers/gemini";
import * as openai    from "../src/providers/openai";
import * as anthropic from "../src/providers/anthropic";
import * as grok      from "../src/providers/grok";
import * as deepseek  from "../src/providers/deepseek";
import * as ondevice  from "../src/providers/ondevice";

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

  it("defaults to matching the transcript's language", () => {
    const prompt = buildPrompt(TRANSCRIPT, 3);
    expect(prompt).toContain("same language as the transcript");
  });

  it("names the target language when one is chosen", () => {
    const prompt = buildPrompt(TRANSCRIPT, 3, "fi");
    // The English name, not the native one — models follow it more reliably
    expect(prompt).toContain("in Finnish");
    expect(prompt).not.toContain("same language as the transcript");
  });

  it("repeats the language instruction so it survives a long transcript", () => {
    const prompt = buildPrompt(TRANSCRIPT, 3, "ja");
    expect(prompt.match(/in Japanese/g)).toHaveLength(2);
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

  it("dispatches to deepseek provider", async () => {
    await generateQuizQuestions(TRANSCRIPT, 3, API_KEY, MODEL, PROVIDER_DEEPSEEK);
    expect(deepseek.generateQuizQuestions).toHaveBeenCalledOnce();
  });

  it("dispatches to the on-device provider with the prompt and quiz language", async () => {
    await generateQuizQuestions(TRANSCRIPT, 3, API_KEY, MODEL, PROVIDER_ONDEVICE, "ja");
    expect(ondevice.generateQuizQuestions).toHaveBeenCalledOnce();
    const [prompt, quizLanguage] = (ondevice.generateQuizQuestions as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    expect(prompt).toContain(TRANSCRIPT);
    // Chrome's Prompt API needs the language as a session param, not just prompt text
    expect(quizLanguage).toBe("ja");
    expect((ondevice.generateQuizQuestions as ReturnType<typeof vi.fn>).mock.calls[0]).toHaveLength(2);
  });

  it("defaults the on-device quiz language to auto", async () => {
    await generateQuizQuestions(TRANSCRIPT, 3, API_KEY, MODEL, PROVIDER_ONDEVICE);
    const [, quizLanguage] = (ondevice.generateQuizQuestions as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    expect(quizLanguage).toBe("auto");
  });

  it("puts the chosen language into the prompt for cloud providers", async () => {
    await generateQuizQuestions(TRANSCRIPT, 3, API_KEY, MODEL, PROVIDER_GEMINI, "vi");
    const [prompt] = (gemini.generateQuizQuestions as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(prompt).toContain("in Vietnamese");
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

  it("dispatches to deepseek", async () => {
    await listModels(PROVIDER_DEEPSEEK, API_KEY);
    expect(deepseek.listModels).toHaveBeenCalledWith(API_KEY);
  });

  it("throws for an unknown provider", async () => {
    await expect(listModels("unknown" as never, API_KEY)).rejects.toThrow("Unknown provider");
  });

  it("throws for the on-device provider (no listable models)", async () => {
    await expect(listModels(PROVIDER_ONDEVICE, API_KEY)).rejects.toThrow();
  });
});
