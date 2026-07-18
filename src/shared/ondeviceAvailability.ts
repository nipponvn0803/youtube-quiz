export type OnDeviceAvailability = "unsupported" | LanguageModelAvailability;

export async function checkOnDeviceAvailability(): Promise<OnDeviceAvailability> {
  if (typeof LanguageModel === "undefined") return "unsupported";

  try {
    return await LanguageModel.availability();
  } catch {
    return "unavailable";
  }
}

export async function downloadOnDeviceModel(onProgress?: (fraction: number) => void): Promise<void> {
  if (typeof LanguageModel === "undefined") {
    throw new Error("On-device AI is not supported in this browser.");
  }

  const session = await LanguageModel.create({
    expectedOutputs: [{ type: "text", languages: ["en"] }],
    monitor(m) {
      m.addEventListener("downloadprogress", (e) => onProgress?.(e.loaded));
    },
  });
  session.destroy();
}
