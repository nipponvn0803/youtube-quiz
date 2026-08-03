import { QuizQuestion } from "../shared/types";
import { parseQuizQuestions } from "../shared/utils";
import { checkOnDeviceAvailability } from "../shared/ondeviceAvailability";
import {
  ONDEVICE_LANGUAGES,
  QUIZ_LANGUAGE_AUTO,
  QuizLanguage,
  isOnDeviceSupported,
  quizLanguageEnglishName,
} from "../shared/quizLanguages";

const QUIZ_JSON_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
          correctIndex: { type: "integer" },
          explanation: { type: "string" },
        },
        required: ["text", "options", "correctIndex"],
      },
    },
  },
  required: ["questions"],
};

function unsupportedLanguageError(quizLanguage: QuizLanguage): Error {
  const name = quizLanguageEnglishName(quizLanguage) ?? quizLanguage;
  return new Error(
    `Chrome's on-device AI can't generate quizzes in ${name}. It supports English, Japanese, Spanish, German, and French. Open the extension options and pick one of those, or switch to a cloud provider.`,
  );
}

export async function generateQuizQuestions(
  prompt: string,
  quizLanguage: QuizLanguage = QUIZ_LANGUAGE_AUTO,
): Promise<QuizQuestion[]> {
  // Fail before touching the API — create() would reject with NotSupportedError
  // anyway, but with a message that means nothing to the user.
  if (!isOnDeviceSupported(quizLanguage)) throw unsupportedLanguageError(quizLanguage);

  // For "auto" we don't know the transcript's language, so declare all five the
  // Prompt API supports rather than pinning to English and forcing a Spanish
  // video to produce an English quiz.
  const languages = quizLanguage === QUIZ_LANGUAGE_AUTO ? ONDEVICE_LANGUAGES : [quizLanguage];

  const availability = await checkOnDeviceAvailability(languages);

  if (availability !== "available") {
    if (availability === "downloadable" || availability === "downloading") {
      throw new Error(
        "The on-device AI model is still downloading. Open the extension options to check progress, or switch to a cloud provider.",
      );
    }
    throw new Error(
      "On-device AI isn't available on this browser or device. Open the extension options and switch to a cloud provider (Gemini, OpenAI, Anthropic, Grok, or DeepSeek) with your own API key.",
    );
  }

  let session: LanguageModelSession;
  try {
    session = await LanguageModel!.create({
      expectedOutputs: [{ type: "text", languages: [...languages] }],
    });
  } catch (err) {
    // Chrome throws NotSupportedError when it can't serve the requested
    // language, even if availability() said otherwise a moment earlier.
    if (err instanceof DOMException && err.name === "NotSupportedError") {
      throw unsupportedLanguageError(quizLanguage);
    }
    throw err;
  }

  try {
    const content = await session.prompt(prompt, { responseConstraint: QUIZ_JSON_SCHEMA });
    return parseQuizQuestions(content);
  } finally {
    session.destroy();
  }
}
