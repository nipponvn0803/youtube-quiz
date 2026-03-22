import { QuizQuestion } from "../shared/types";
import { parseQuizQuestions } from "../shared/utils";

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
}

interface AnthropicModelsResponse {
  data: Array<{ id: string }>;
}

const ANTHROPIC_VERSION = "2023-06-01";

export async function generateQuizQuestions(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<QuizQuestion[]> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as AnthropicResponse;
  const content = data.content?.find((b) => b.type === "text")?.text;
  if (!content) throw new Error("Empty response from Anthropic");

  return parseQuizQuestions(content);
}

export async function listModels(apiKey: string): Promise<string[]> {
  const response = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
  });

  if (!response.ok) {
    throw new Error(`Anthropic models error ${response.status}`);
  }

  const data = (await response.json()) as AnthropicModelsResponse;
  return (data.data ?? []).map((m) => m.id).sort();
}
