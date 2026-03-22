import { QuizQuestion } from "../shared/types";

interface GeminiResponse {
  candidates: Array<{
    content: { parts: Array<{ text: string }> };
  }>;
}

interface GeminiModelsResponse {
  models: Array<{
    name: string;
    supportedGenerationMethods: string[];
  }>;
}

export async function generateQuizQuestions(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<QuizQuestion[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as GeminiResponse;
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error("Empty response from Gemini");

  return parseQuestions(content);
}

export async function listModels(apiKey: string): Promise<string[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`,
  );

  if (!response.ok) {
    throw new Error(`Gemini models error ${response.status}`);
  }

  const data = (await response.json()) as GeminiModelsResponse;
  return (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace("models/", ""))
    .sort();
}

function parseQuestions(content: string): QuizQuestion[] {
  const parsed = JSON.parse(content) as {
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
