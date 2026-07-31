import { QuizQuestion } from "../shared/types";
import { parseQuizQuestions } from "../shared/utils";
import { checkOnDeviceAvailability } from "../shared/ondeviceAvailability";

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

export async function generateQuizQuestions(prompt: string): Promise<QuizQuestion[]> {
  const availability = await checkOnDeviceAvailability();

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

  const session = await LanguageModel!.create({
    expectedOutputs: [{ type: "text", languages: ["en"] }],
  });
  try {
    const content = await session.prompt(prompt, { responseConstraint: QUIZ_JSON_SCHEMA });
    return parseQuizQuestions(content);
  } finally {
    session.destroy();
  }
}
