// The language the generated quiz is written in. Separate from the UI locale in
// types.ts — that one only translates the extension's own chrome.
//
// This module deliberately imports nothing from types.ts so types.ts can import
// QuizLanguage from here without a cycle.

export const QUIZ_LANGUAGE_AUTO = "auto" as const;

export type QuizLanguageCode =
  | "en" | "es" | "fr" | "de" | "pt" | "ja" | "ko"
  | "zh" | "hi" | "vi" | "ru" | "ar" | "fi";

export type QuizLanguage = typeof QUIZ_LANGUAGE_AUTO | QuizLanguageCode;

// englishName goes into the prompt — models follow "in Vietnamese" more
// reliably than "in Tiếng Việt". nativeName is what the dropdown shows, so it
// needs no translation of its own.
export const QUIZ_LANGUAGES: ReadonlyArray<{
  code: QuizLanguageCode;
  englishName: string;
  nativeName: string;
}> = [
  { code: "en", englishName: "English",    nativeName: "English" },
  { code: "es", englishName: "Spanish",    nativeName: "Español" },
  { code: "fr", englishName: "French",     nativeName: "Français" },
  { code: "de", englishName: "German",     nativeName: "Deutsch" },
  { code: "pt", englishName: "Portuguese", nativeName: "Português" },
  { code: "ja", englishName: "Japanese",   nativeName: "日本語" },
  { code: "ko", englishName: "Korean",     nativeName: "한국어" },
  { code: "zh", englishName: "Chinese",    nativeName: "中文" },
  { code: "hi", englishName: "Hindi",      nativeName: "हिन्दी" },
  { code: "vi", englishName: "Vietnamese", nativeName: "Tiếng Việt" },
  { code: "ru", englishName: "Russian",    nativeName: "Русский" },
  { code: "ar", englishName: "Arabic",     nativeName: "العربية" },
  { code: "fi", englishName: "Finnish",    nativeName: "Suomi" },
];

// Chrome's built-in Prompt API (Gemini Nano) only accepts these five. Anything
// else makes LanguageModel.create() reject with NotSupportedError and
// availability() report "unavailable".
// https://developer.chrome.com/docs/ai/prompt-api
export const ONDEVICE_LANGUAGES: readonly QuizLanguageCode[] = ["en", "ja", "es", "de", "fr"];

export function isOnDeviceSupported(lang: QuizLanguage): boolean {
  // "auto" is supported: we hand the model all five and let it follow the transcript.
  if (lang === QUIZ_LANGUAGE_AUTO) return true;
  return ONDEVICE_LANGUAGES.includes(lang);
}

// null for "auto" — the caller phrases that case differently.
export function quizLanguageEnglishName(lang: QuizLanguage): string | null {
  if (lang === QUIZ_LANGUAGE_AUTO) return null;
  return QUIZ_LANGUAGES.find((l) => l.code === lang)?.englishName ?? null;
}
