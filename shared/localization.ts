export const DEFAULT_LOCALE = "en-US" as const;
export const PSEUDO_LOCALE = "en-XA" as const;

export const SUPPORTED_LOCALES = [
  "en-US",
  "es-ES",
  "ar",
  PSEUDO_LOCALE,
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export type LocaleDirection = "ltr" | "rtl";

export interface LocaleMetadata {
  locale: SupportedLocale;
  englishName: string;
  nativeName: string;
  defaultRegion: string;
  direction: LocaleDirection;
  testingOnly?: boolean;
}

export interface LocalizationSettings {
  locale: SupportedLocale;
  region: string;
}

export const LOCALE_METADATA: Record<SupportedLocale, LocaleMetadata> = {
  "en-US": {
    locale: "en-US",
    englishName: "English (United States)",
    nativeName: "English (United States)",
    defaultRegion: "US",
    direction: "ltr",
  },
  "es-ES": {
    locale: "es-ES",
    englishName: "Spanish (Spain)",
    nativeName: "Español (España)",
    defaultRegion: "ES",
    direction: "ltr",
  },
  ar: {
    locale: "ar",
    englishName: "Arabic",
    nativeName: "العربية",
    defaultRegion: "SA",
    direction: "rtl",
  },
  "en-XA": {
    locale: "en-XA",
    englishName: "Pseudo locale",
    nativeName: "[!! Pseudo locale !!]",
    defaultRegion: "XA",
    direction: "ltr",
    testingOnly: true,
  },
};

export const DEFAULT_LOCALIZATION_SETTINGS: LocalizationSettings = {
  locale: DEFAULT_LOCALE,
  region: LOCALE_METADATA[DEFAULT_LOCALE].defaultRegion,
};

const LOCALE_ALIASES: Record<string, SupportedLocale> = {
  en: "en-US",
  "en-us": "en-US",
  "en_us": "en-US",
  es: "es-ES",
  "es-es": "es-ES",
  "es_es": "es-ES",
  ar: "ar",
  "ar-sa": "ar",
  "ar_sa": "ar",
  "en-xa": "en-XA",
  "en_xa": "en-XA",
  pseudo: "en-XA",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeSupportedLocale(value: unknown): SupportedLocale {
  if (typeof value !== "string") return DEFAULT_LOCALE;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_LOCALE;
  if ((SUPPORTED_LOCALES as readonly string[]).includes(trimmed)) {
    return trimmed as SupportedLocale;
  }
  const lower = trimmed.toLowerCase();
  if (LOCALE_ALIASES[lower]) return LOCALE_ALIASES[lower];
  const language = lower.split(/[-_]/)[0] ?? "";
  return LOCALE_ALIASES[language] ?? DEFAULT_LOCALE;
}

export function localeDirection(locale: unknown): LocaleDirection {
  return LOCALE_METADATA[normalizeSupportedLocale(locale)].direction;
}

function normalizeRegion(value: unknown, locale: SupportedLocale): string {
  if (typeof value === "string") {
    const trimmed = value.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(trimmed) || trimmed === "XA") return trimmed;
  }
  return LOCALE_METADATA[locale].defaultRegion;
}

export function normalizeLocalizationSettings(
  value: unknown,
  fallback: LocalizationSettings = DEFAULT_LOCALIZATION_SETTINGS
): LocalizationSettings {
  const input = isRecord(value) ? value : {};
  const fallbackLocale = normalizeSupportedLocale(fallback.locale);
  const locale =
    input.locale === undefined
      ? fallbackLocale
      : normalizeSupportedLocale(input.locale);
  const regionInput =
    input.region === undefined && input.locale !== undefined && locale !== fallbackLocale
      ? undefined
      : input.region === undefined
        ? fallback.region
        : input.region;
  return {
    locale,
    region: normalizeRegion(regionInput, locale),
  };
}
