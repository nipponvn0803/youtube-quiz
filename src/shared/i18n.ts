import en from "../locales/en.json";
import vi from "../locales/vi.json";
import { Locale, LOCALE_EN, LOCALE_VI } from "./types";

const LOCALES: Record<Locale, Record<string, string>> = { [LOCALE_EN]: en, [LOCALE_VI]: vi };

let currentLocale: Locale = LOCALE_EN;

export function setLocale(locale: Locale): void {
  currentLocale = LOCALES[locale] ? locale : LOCALE_EN;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(key: string, vars?: Record<string, string | number>): string {
  let str = LOCALES[currentLocale][key] ?? LOCALES[LOCALE_EN][key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return str;
}

// Translates every element under `root` that carries a data-i18n* attribute.
// Plain text uses data-i18n; markup-bearing strings (e.g. containing <strong>)
// use data-i18n-html since our locale JSON is static/trusted, not user input.
export function applyTranslations(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(key);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-html]").forEach((el) => {
    const key = el.dataset.i18nHtml;
    if (key) el.innerHTML = t(key);
  });
  root.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]").forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (key) el.placeholder = t(key);
  });
}
