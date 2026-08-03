import type { QuizLanguage } from "./quizLanguages";

export type QuizOption = {
  text: string;
};

export type QuizQuestion = {
  id: string;
  text: string;
  options: QuizOption[];
  correctIndex: number;
  explanation?: string;
};

export type QuizRequestMessage = {
  type: "REQUEST_QUIZ";
  videoId: string;
  videoUrl: string;
  transcript: string;
  currentTimeSeconds: number;
  numQuestions: number;
};

export type QuizResponseMessage =
  | {
      type: "QUIZ_SUCCESS";
      questions: QuizQuestion[];
    }
  | {
      type: "QUIZ_ERROR";
      error: string;
    };

export const PROVIDER_GEMINI    = "gemini"    as const;
export const PROVIDER_OPENAI    = "openai"    as const;
export const PROVIDER_ANTHROPIC = "anthropic" as const;
export const PROVIDER_GROK      = "grok"      as const;
export const PROVIDER_DEEPSEEK  = "deepseek"  as const;
export const PROVIDER_ONDEVICE  = "ondevice"  as const;

export type AIProvider =
  | typeof PROVIDER_GEMINI
  | typeof PROVIDER_OPENAI
  | typeof PROVIDER_ANTHROPIC
  | typeof PROVIDER_GROK
  | typeof PROVIDER_DEEPSEEK
  | typeof PROVIDER_ONDEVICE;

export const LOCALE_EN = "en" as const;
export const LOCALE_VI = "vi" as const;

export type Locale = typeof LOCALE_EN | typeof LOCALE_VI;

export type ExtensionSettings = {
  provider: AIProvider;
  apiKey: string;
  model: string;
  quizIntervalMinutes: number;
  quizNumQuestions: number;
  enabled: boolean;
  language: Locale;      // UI chrome only
  quizLanguage: QuizLanguage;  // language the generated quiz is written in
};
