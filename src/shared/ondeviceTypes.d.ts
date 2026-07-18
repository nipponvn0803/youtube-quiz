export {};

declare global {
  type LanguageModelAvailability = "unavailable" | "downloadable" | "downloading" | "available";

  interface LanguageModelParams {
    defaultTopK: number;
    maxTopK: number;
    defaultTemperature: number;
    maxTemperature: number;
  }

  interface LanguageModelDownloadProgressEvent extends Event {
    loaded: number;
  }

  interface LanguageModelMonitor {
    addEventListener(
      type: "downloadprogress",
      listener: (event: LanguageModelDownloadProgressEvent) => void,
    ): void;
  }

  interface LanguageModelExpected {
    type: "text";
    languages: string[];
  }

  interface LanguageModelCreateOptions {
    temperature?: number;
    topK?: number;
    initialPrompts?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    expectedInputs?: LanguageModelExpected[];
    expectedOutputs?: LanguageModelExpected[];
    signal?: AbortSignal;
    monitor?: (m: LanguageModelMonitor) => void;
  }

  interface LanguageModelPromptOptions {
    responseConstraint?: object;
    omitResponseConstraintInput?: boolean;
    signal?: AbortSignal;
  }

  interface LanguageModelSession {
    prompt(input: string, options?: LanguageModelPromptOptions): Promise<string>;
    destroy(): void;
  }

  var LanguageModel:
    | {
        availability(options?: object): Promise<LanguageModelAvailability>;
        create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
        params(): Promise<LanguageModelParams | null>;
      }
    | undefined;
}
