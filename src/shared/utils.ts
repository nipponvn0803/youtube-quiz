import { QuizQuestion } from "./types";

export function sanitizeNumber(raw: string, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

type RawQuestion = {
  text?: unknown;
  options?: unknown;
  correctIndex?: unknown;
  explanation?: unknown;
};

// Model output is untrusted: a question can come back with a correctIndex past
// the end of `options`, a non-string option, or missing text. Returning null
// drops just that question instead of failing the whole quiz — and keeps an
// out-of-range index from throwing later, when the dialog reads
// `options[correctIndex].text` to show the answer for a wrong guess.
function toQuizQuestion(raw: RawQuestion): Omit<QuizQuestion, "id"> | null {
  if (typeof raw?.text !== "string" || !raw.text.trim()) return null;
  if (!Array.isArray(raw.options)) return null;

  const options = raw.options.filter((o): o is string => typeof o === "string" && o.length > 0);
  // A partly-invalid option list would shift what correctIndex points at, so
  // reject the question rather than silently renumbering its answers.
  if (options.length !== raw.options.length || options.length < 2) return null;

  if (typeof raw.correctIndex !== "number" || !Number.isInteger(raw.correctIndex)) return null;
  if (raw.correctIndex < 0 || raw.correctIndex >= options.length) return null;

  return {
    text: raw.text,
    options: options.map((text) => ({ text })),
    correctIndex: raw.correctIndex,
    explanation: typeof raw.explanation === "string" ? raw.explanation : undefined,
  };
}

export function parseQuizQuestions(content: string): QuizQuestion[] {
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();

  const parsed = JSON.parse(jsonStr) as { questions?: unknown } | null;
  if (!Array.isArray(parsed?.questions)) {
    throw new Error("Model response has no questions array");
  }

  const questions = (parsed.questions as RawQuestion[])
    .map(toQuizQuestion)
    .filter((q): q is Omit<QuizQuestion, "id"> => q !== null)
    .map((q, i) => ({ id: `q-${i}`, ...q }));

  if (!questions.length) {
    throw new Error("Model response contained no valid questions");
  }

  return questions;
}
