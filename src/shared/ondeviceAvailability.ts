import { ONDEVICE_LANGUAGES } from "./quizLanguages";

export type OnDeviceAvailability = "unsupported" | LanguageModelAvailability;

// Chrome reports availability per output language, so callers that care about a
// specific language must pass it — a model that's "available" for English can
// still be "unavailable" for Japanese. Defaults to every language the Prompt API
// supports, which is what the generic "is on-device AI usable at all?" check wants.
function expectedOutputs(languages: readonly string[]): LanguageModelExpected[] {
  return [{ type: "text", languages: [...languages] }];
}

export async function checkOnDeviceAvailability(
  languages: readonly string[] = ONDEVICE_LANGUAGES,
): Promise<OnDeviceAvailability> {
  if (typeof LanguageModel === "undefined") return "unsupported";

  try {
    return await LanguageModel.availability({ expectedOutputs: expectedOutputs(languages) });
  } catch {
    return "unavailable";
  }
}

export async function downloadOnDeviceModel(
  onProgress?: (fraction: number) => void,
  languages: readonly string[] = ONDEVICE_LANGUAGES,
): Promise<void> {
  if (typeof LanguageModel === "undefined") {
    throw new Error("On-device AI is not supported in this browser.");
  }

  const session = await LanguageModel.create({
    expectedOutputs: expectedOutputs(languages),
    monitor(m) {
      m.addEventListener("downloadprogress", (e) => onProgress?.(e.loaded));
    },
  });
  session.destroy();
}
