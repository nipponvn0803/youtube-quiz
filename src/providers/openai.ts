import { QuizQuestion } from "../shared/types";

interface OpenAIResponse {
  choices: Array<{ message: { content: string } }>;
}

interface OpenAIModelsResponse {
  data: Array<{ id: string }>;
}

export async function generateQuizQuestions(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<QuizQuestion[]> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as OpenAIResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from OpenAI");

  return parseQuestions(content);
}

export async function listModels(apiKey: string): Promise<string[]> {
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { "Authorization": `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    throw new Error(`OpenAI models error ${response.status}`);
  }

  const data = (await response.json()) as OpenAIModelsResponse;
  return (data.data ?? [])
    .map((m) => m.id)
    .filter((id) => /^(gpt-|o1|o3)/.test(id))
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
