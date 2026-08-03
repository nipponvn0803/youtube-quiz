import { describe, it, expect, vi, afterEach } from "vitest";
import { generateQuizQuestions } from "../../src/providers/ondevice";
import { SAMPLE_QUESTIONS_PAYLOAD } from "../helpers";

const PROMPT = "What did the video cover?";

afterEach(() => vi.unstubAllGlobals());

function stubLanguageModel(availability: string, session?: Partial<LanguageModelSession>) {
  const stub = {
    availability: vi.fn().mockResolvedValue(availability),
    create: vi.fn().mockResolvedValue({
      prompt: vi.fn().mockResolvedValue(JSON.stringify(SAMPLE_QUESTIONS_PAYLOAD)),
      destroy: vi.fn(),
      ...session,
    }),
  };
  vi.stubGlobal("LanguageModel", stub);
  return stub;
}

function createdLanguages(stub: ReturnType<typeof stubLanguageModel>): string[] {
  const [options] = stub.create.mock.calls[0] as [LanguageModelCreateOptions];
  return options.expectedOutputs![0].languages;
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

describe("ondevice.generateQuizQuestions — quiz language", () => {
  it("declares every supported language for 'auto' so a non-English video isn't forced into English", async () => {
    const stub = stubLanguageModel("available");

    await generateQuizQuestions(PROMPT, "auto");

    expect(createdLanguages(stub)).toEqual(["en", "ja", "es", "de", "fr"]);
  });

  it("defaults to 'auto' when no language is given", async () => {
    const stub = stubLanguageModel("available");

    await generateQuizQuestions(PROMPT);

    expect(createdLanguages(stub)).toEqual(["en", "ja", "es", "de", "fr"]);
  });

  it("pins expectedOutputs to a single explicitly chosen language", async () => {
    const stub = stubLanguageModel("available");

    await generateQuizQuestions(PROMPT, "ja");

    expect(createdLanguages(stub)).toEqual(["ja"]);
  });

  it("checks availability for the chosen language, not just generically", async () => {
    const stub = stubLanguageModel("available");

    await generateQuizQuestions(PROMPT, "de");

    const [options] = stub.availability.mock.calls[0] as [{ expectedOutputs: LanguageModelExpected[] }];
    expect(options.expectedOutputs[0].languages).toEqual(["de"]);
  });

  it("rejects an unsupported language without touching the API", async () => {
    const stub = stubLanguageModel("available");

    // Finnish is in the quiz language list but not in Gemini Nano's set of five
    await expect(generateQuizQuestions(PROMPT, "fi")).rejects.toThrow("can't generate quizzes in Finnish");
    expect(stub.create).not.toHaveBeenCalled();
    expect(stub.availability).not.toHaveBeenCalled();
  });

  it("converts a NotSupportedError from create() into a readable message", async () => {
    const stub = stubLanguageModel("available");
    stub.create.mockRejectedValue(new DOMException("nope", "NotSupportedError"));

    await expect(generateQuizQuestions(PROMPT, "es")).rejects.toThrow("can't generate quizzes in Spanish");
  });

  it("rethrows non-NotSupportedError failures from create() unchanged", async () => {
    const stub = stubLanguageModel("available");
    stub.create.mockRejectedValue(new Error("disk full"));

    await expect(generateQuizQuestions(PROMPT, "es")).rejects.toThrow("disk full");
  });
});
