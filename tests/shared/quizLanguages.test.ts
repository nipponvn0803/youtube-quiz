import { describe, it, expect } from "vitest";
import {
  ONDEVICE_LANGUAGES,
  QUIZ_LANGUAGES,
  QUIZ_LANGUAGE_AUTO,
  isOnDeviceSupported,
  quizLanguageEnglishName,
} from "../../src/shared/quizLanguages";

describe("QUIZ_LANGUAGES", () => {
  it("has no duplicate codes", () => {
    const codes = QUIZ_LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("gives every language both an English and a native name", () => {
    for (const { code, englishName, nativeName } of QUIZ_LANGUAGES) {
      expect(englishName, code).toBeTruthy();
      expect(nativeName, code).toBeTruthy();
    }
  });

  it("includes every on-device language, so the filtered list is never empty", () => {
    const codes = QUIZ_LANGUAGES.map((l) => l.code);
    for (const code of ONDEVICE_LANGUAGES) {
      expect(codes).toContain(code);
    }
  });
});

describe("isOnDeviceSupported", () => {
  it("accepts a language Gemini Nano supports", () => {
    expect(isOnDeviceSupported("ja")).toBe(true);
  });

  it("rejects a language Gemini Nano doesn't support", () => {
    expect(isOnDeviceSupported("vi")).toBe(false);
    expect(isOnDeviceSupported("fi")).toBe(false);
  });

  it("accepts auto — we hand the model all five and let it follow the transcript", () => {
    expect(isOnDeviceSupported(QUIZ_LANGUAGE_AUTO)).toBe(true);
  });
});

describe("quizLanguageEnglishName", () => {
  it("returns the English name for prompt injection", () => {
    expect(quizLanguageEnglishName("vi")).toBe("Vietnamese");
    expect(quizLanguageEnglishName("fi")).toBe("Finnish");
  });

  it("returns null for auto, which the caller phrases differently", () => {
    expect(quizLanguageEnglishName(QUIZ_LANGUAGE_AUTO)).toBeNull();
  });
});
