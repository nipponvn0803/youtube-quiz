import { AIProvider, PROVIDER_GEMINI, PROVIDER_OPENAI, PROVIDER_ANTHROPIC, PROVIDER_GROK, QuizQuestion } from "./shared/types";

// Best balance of speed, quality, and cost per provider
export const RECOMMENDED_MODELS: Record<AIProvider, string> = {
  [PROVIDER_GEMINI]:    "gemini-3-flash-preview",
  [PROVIDER_OPENAI]:    "gpt-4o-mini",
  [PROVIDER_ANTHROPIC]: "claude-haiku-4-5-20251001",
  [PROVIDER_GROK]:      "grok-4-1-fast",
};
import * as gemini from "./providers/gemini";
import * as openai from "./providers/openai";
import * as anthropic from "./providers/anthropic";
import * as grok from "./providers/grok";

export function buildPrompt(transcript: string, numQuestions: number): string {
  return `You are a quiz generator. Based on the following video transcript, generate ${numQuestions} multiple-choice questions to test comprehension of what was covered. Each question must have exactly 4 options with one correct answer.

Transcript:
${transcript}

Respond with a JSON object in this exact format:
{
  "questions": [
    {
      "text": "question text here",
      "options": ["option A", "option B", "option C", "option D"],
      "correctIndex": 0,
      "explanation": "brief explanation of why the answer is correct"
    }
  ]
}`;
}

export async function generateQuizQuestions(
  transcript: string,
  numQuestions: number,
  apiKey: string,
  model: string,
  provider: AIProvider,
): Promise<QuizQuestion[]> {
  const prompt = buildPrompt(transcript, numQuestions);
  console.log("youtube-quiz: generateQuizQuestions | provider =", provider, "| model =", model);

  switch (provider) {
    case PROVIDER_GEMINI:    return gemini.generateQuizQuestions(prompt, apiKey, model);
    case PROVIDER_OPENAI:    return openai.generateQuizQuestions(prompt, apiKey, model);
    case PROVIDER_ANTHROPIC: return anthropic.generateQuizQuestions(prompt, apiKey, model);
    case PROVIDER_GROK:      return grok.generateQuizQuestions(prompt, apiKey, model);
    default:                 throw new Error(`Unknown provider: ${provider as string}`);
  }
}

export async function listModels(provider: AIProvider, apiKey: string): Promise<string[]> {
  switch (provider) {
    case PROVIDER_GEMINI:    return gemini.listModels(apiKey);
    case PROVIDER_OPENAI:    return openai.listModels(apiKey);
    case PROVIDER_ANTHROPIC: return anthropic.listModels(apiKey);
    case PROVIDER_GROK:      return grok.listModels(apiKey);
    default:                 throw new Error(`Unknown provider: ${provider as string}`);
  }
}
