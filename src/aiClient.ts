import { AIProvider, PROVIDER_GEMINI, PROVIDER_OPENAI, PROVIDER_ANTHROPIC, PROVIDER_GROK, PROVIDER_DEEPSEEK, PROVIDER_ONDEVICE, QuizQuestion } from "./shared/types";
import { QuizLanguage, QUIZ_LANGUAGE_AUTO, quizLanguageEnglishName } from "./shared/quizLanguages";

// Best balance of speed, quality, and cost per provider
export const RECOMMENDED_MODELS: Record<AIProvider, string> = {
  [PROVIDER_GEMINI]:    "gemini-3-flash-preview",
  [PROVIDER_OPENAI]:    "gpt-4o-mini",
  [PROVIDER_ANTHROPIC]: "claude-haiku-4-5-20251001",
  [PROVIDER_GROK]:      "grok-4-1-fast",
  [PROVIDER_DEEPSEEK]:  "deepseek-v4-flash",
  [PROVIDER_ONDEVICE]:  "",
};
import * as gemini from "./providers/gemini";
import * as openai from "./providers/openai";
import * as anthropic from "./providers/anthropic";
import * as grok from "./providers/grok";
import * as deepseek from "./providers/deepseek";
import * as ondevice from "./providers/ondevice";

// Stated twice on purpose — once up front and once next to the JSON format.
// Models drift back to the transcript's language over a long prompt, and
// Anthropic sends no API-level structured-output hint at all, so for that
// provider prompt adherence is the only thing holding the output together.
function languageInstruction(quizLanguage: QuizLanguage): string {
  const name = quizLanguageEnglishName(quizLanguage);
  return name
    ? `Write the questions, options, and explanations in ${name}, even if the transcript is in a different language.`
    : "Write the questions, options, and explanations in the same language as the transcript.";
}

export function buildPrompt(
  transcript: string,
  numQuestions: number,
  quizLanguage: QuizLanguage = QUIZ_LANGUAGE_AUTO,
): string {
  const language = languageInstruction(quizLanguage);
  console.log("youtube-quiz: buildPrompt | language =", language);

  return `You are a quiz generator. Based on the following video transcript, generate ${numQuestions} multiple-choice questions to test comprehension of what was covered. Each question must have exactly 4 options with one correct answer. ${language}

Transcript:
${transcript}

${language}

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
  quizLanguage: QuizLanguage = QUIZ_LANGUAGE_AUTO,
): Promise<QuizQuestion[]> {
  const prompt = buildPrompt(transcript, numQuestions, quizLanguage);
  console.log("youtube-quiz: generateQuizQuestions | provider =", provider, "| model =", model, "| quizLanguage =", quizLanguage);

  switch (provider) {
    case PROVIDER_GEMINI:    return gemini.generateQuizQuestions(prompt, apiKey, model);
    case PROVIDER_OPENAI:    return openai.generateQuizQuestions(prompt, apiKey, model);
    case PROVIDER_ANTHROPIC: return anthropic.generateQuizQuestions(prompt, apiKey, model);
    case PROVIDER_GROK:      return grok.generateQuizQuestions(prompt, apiKey, model);
    case PROVIDER_DEEPSEEK:  return deepseek.generateQuizQuestions(prompt, apiKey, model);
    // On-device also needs the language itself — Chrome's Prompt API takes it
    // as a session parameter, not just as prompt text.
    case PROVIDER_ONDEVICE:  return ondevice.generateQuizQuestions(prompt, quizLanguage);
    default:                 throw new Error(`Unknown provider: ${provider as string}`);
  }
}

export async function listModels(provider: AIProvider, apiKey: string): Promise<string[]> {
  switch (provider) {
    case PROVIDER_GEMINI:    return gemini.listModels(apiKey);
    case PROVIDER_OPENAI:    return openai.listModels(apiKey);
    case PROVIDER_ANTHROPIC: return anthropic.listModels(apiKey);
    case PROVIDER_GROK:      return grok.listModels(apiKey);
    case PROVIDER_DEEPSEEK:  return deepseek.listModels(apiKey);
    case PROVIDER_ONDEVICE:  throw new Error("On-device provider has no listable models");
    default:                 throw new Error(`Unknown provider: ${provider as string}`);
  }
}
