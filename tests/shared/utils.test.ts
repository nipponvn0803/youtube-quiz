import { describe, it, expect } from "vitest";
import { sanitizeNumber, parseQuizQuestions } from "../../src/shared/utils";

const SAMPLE_PAYLOAD = {
  questions: [
    {
      text: "What is the capital of France?",
      options: ["Berlin", "Madrid", "Paris", "Rome"],
      correctIndex: 2,
      explanation: "Paris is the capital of France.",
    },
  ],
};

describe("sanitizeNumber", () => {
  it("returns the value when within range", () => {
    expect(sanitizeNumber("5", 3, 1, 10)).toBe(5);
  });

  it("clamps to min", () => {
    expect(sanitizeNumber("0", 3, 1, 10)).toBe(1);
  });

  it("clamps to max", () => {
    expect(sanitizeNumber("99", 3, 1, 10)).toBe(10);
  });

  it("truncates decimals", () => {
    expect(sanitizeNumber("4.9", 3, 1, 10)).toBe(4);
  });

  it("returns fallback for non-numeric input", () => {
    expect(sanitizeNumber("abc", 3, 1, 10)).toBe(3);
  });

  it("clamps empty string (Number('') === 0) to min", () => {
    expect(sanitizeNumber("", 7, 1, 10)).toBe(1);
  });

  it("returns fallback for NaN-producing input", () => {
    expect(sanitizeNumber("NaN", 5, 1, 10)).toBe(5);
  });
});

describe("parseQuizQuestions", () => {
  it("parses plain JSON", () => {
    const questions = parseQuizQuestions(JSON.stringify(SAMPLE_PAYLOAD));

    expect(questions).toHaveLength(1);
    expect(questions[0].id).toBe("q-0");
    expect(questions[0].text).toBe("What is the capital of France?");
    expect(questions[0].options).toEqual([
      { text: "Berlin" },
      { text: "Madrid" },
      { text: "Paris" },
      { text: "Rome" },
    ]);
    expect(questions[0].correctIndex).toBe(2);
    expect(questions[0].explanation).toBe("Paris is the capital of France.");
  });

  it("parses JSON wrapped in ```json code fences", () => {
    const fenced = "```json\n" + JSON.stringify(SAMPLE_PAYLOAD) + "\n```";
    const questions = parseQuizQuestions(fenced);
    expect(questions).toHaveLength(1);
    expect(questions[0].correctIndex).toBe(2);
  });

  it("parses JSON wrapped in plain ``` code fences", () => {
    const fenced = "```\n" + JSON.stringify(SAMPLE_PAYLOAD) + "\n```";
    const questions = parseQuizQuestions(fenced);
    expect(questions).toHaveLength(1);
  });

  it("assigns sequential ids starting at q-0", () => {
    const payload = {
      questions: [
        { text: "Q1", options: ["a", "b", "c", "d"], correctIndex: 0 },
        { text: "Q2", options: ["a", "b", "c", "d"], correctIndex: 1 },
        { text: "Q3", options: ["a", "b", "c", "d"], correctIndex: 2 },
      ],
    };
    const questions = parseQuizQuestions(JSON.stringify(payload));
    expect(questions.map((q) => q.id)).toEqual(["q-0", "q-1", "q-2"]);
  });

  it("explanation is optional", () => {
    const payload = {
      questions: [{ text: "Q?", options: ["a", "b", "c", "d"], correctIndex: 0 }],
    };
    const [q] = parseQuizQuestions(JSON.stringify(payload));
    expect(q.explanation).toBeUndefined();
  });

  it("throws on invalid JSON", () => {
    expect(() => parseQuizQuestions("not json")).toThrow();
  });

  it("throws when questions key is missing", () => {
    expect(() => parseQuizQuestions(JSON.stringify({ data: [] }))).toThrow();
  });
});
