import { QuizQuestion } from "../shared/types";
import { parseQuizQuestions } from "../shared/utils";

interface GrokResponse {
  choices: Array<{ message: { content: string } }>;
}

interface GrokModelsResponse {
  data: Array<{ id: string }>;
}

export async function generateQuizQuestions(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<QuizQuestion[]> {
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
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
    throw new Error(`Grok API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as GrokResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from Grok");

  return parseQuizQuestions(content);
}

export async function listModels(apiKey: string): Promise<string[]> {
  const response = await fetch("https://api.x.ai/v1/models", {
    headers: { "Authorization": `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    throw new Error(`Grok models error ${response.status}`);
  }

  const data = (await response.json()) as GrokModelsResponse;
  return (data.data ?? []).map((m) => m.id).sort();
}
