import { describe, it, expect, vi, afterEach } from "vitest";
import { generateQuizQuestions } from "../../src/providers/ondevice";
import { SAMPLE_QUESTIONS_PAYLOAD } from "../helpers";

const PROMPT = "What did the video cover?";

afterEach(() => vi.unstubAllGlobals());

function stubLanguageModel(availability: string, session?: Partial<LanguageModelSession>) {
  vi.stubGlobal("LanguageModel", {
    availability: vi.fn().mockResolvedValue(availability),
    create: vi.fn().mockResolvedValue({
      prompt: vi.fn().mockResolvedValue(JSON.stringify(SAMPLE_QUESTIONS_PAYLOAD)),
      destroy: vi.fn(),
      ...session,
    }),
  });
}

describe("ondevice.generateQuizQuestions", () => {
  it("parses a valid response into QuizQuestion[]", async () => {
    stubLanguageModel("available");

    const questions = await generateQuizQuestions(PROMPT);

    expect(questions).toHaveLength(1);
    expect(questions[0].text).toBe("What is the capital of France?");
    expect(questions[0].correctIndex).toBe(2);
    expect(questions[0].id).toBe("q-0");
  });

  it("passes a responseConstraint JSON schema to session.prompt", async () => {
    const promptMock = vi.fn().mockResolvedValue(JSON.stringify(SAMPLE_QUESTIONS_PAYLOAD));
    stubLanguageModel("available", { prompt: promptMock });

    await generateQuizQuestions(PROMPT);

    const [text, options] = promptMock.mock.calls[0] as [string, { responseConstraint: object }];
    expect(text).toBe(PROMPT);
    expect(options.responseConstraint).toBeTypeOf("object");
  });

  it("destroys the session after use", async () => {
    const destroy = vi.fn();
    stubLanguageModel("available", { destroy });

    await generateQuizQuestions(PROMPT);

    expect(destroy).toHaveBeenCalledOnce();
  });

  it("throws a descriptive error when the model is still downloading", async () => {
    stubLanguageModel("downloading");
    await expect(generateQuizQuestions(PROMPT)).rejects.toThrow("still downloading");
  });

  it("throws a descriptive error when the model hasn't been downloaded yet", async () => {
    stubLanguageModel("downloadable");
    await expect(generateQuizQuestions(PROMPT)).rejects.toThrow("still downloading");
  });

  it("throws a descriptive error when on-device AI is unavailable", async () => {
    stubLanguageModel("unavailable");
    await expect(generateQuizQuestions(PROMPT)).rejects.toThrow("cloud provider");
  });

  it("throws a descriptive error when the LanguageModel global doesn't exist", async () => {
    await expect(generateQuizQuestions(PROMPT)).rejects.toThrow("cloud provider");
  });
});
