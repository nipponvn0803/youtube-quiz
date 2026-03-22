import { QuizQuestion } from "./types";

export function sanitizeNumber(raw: string, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function parseQuizQuestions(content: string): QuizQuestion[] {
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();

  const parsed = JSON.parse(jsonStr) as {
    questions: Array<{
      text: string;
      options: string[];
      correctIndex: number;
      explanation?: string;
    }>;
  };

  return parsed.questions.map((q, i) => ({
    id: `q-${i}`,
    text: q.text,
    options: q.options.map((text) => ({ text })),
    correctIndex: q.correctIndex,
    explanation: q.explanation,
  }));
}
