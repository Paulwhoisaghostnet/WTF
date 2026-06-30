import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DesktopAppearance, DesktopIconLayout } from "@shared/desktop";
import {
  DEFAULT_LOCALE,
  DEFAULT_LOCALIZATION_SETTINGS,
  LOCALE_METADATA,
  PSEUDO_LOCALE,
  SUPPORTED_LOCALES,
  localeDirection,
  normalizeLocalizationSettings,
  normalizeSupportedLocale,
  type LocalizationSettings,
  type SupportedLocale,
} from "@shared/localization";
import { api } from "./api";
import { useAuth } from "./auth-context";
import {
  catalogs,
  enUSCatalog,
  systemTextMessageIds,
  type MessageId,
} from "./localization-catalogs";

const LOCALIZATION_STORAGE_KEY = "wtfos:localization";
const DESKTOP_SETTINGS_QUERY_KEY = ["desktop", "settings"] as const;

type MessageValues = Record<string, string | number | boolean | null | undefined>;

type DesktopSettingsResponse = {
  appearance: DesktopAppearance;
  iconLayout: DesktopIconLayout;
  localization: LocalizationSettings;
  updatedAt: string | null;
};

export type TranslateFn = (id: MessageId, values?: MessageValues) => string;

interface LocalizationContextValue {
  locale: SupportedLocale;
  region: string;
  direction: "ltr" | "rtl";
  settings: LocalizationSettings;
  localeOptions: Array<{
    locale: SupportedLocale;
    englishName: string;
    nativeName: string;
    testingOnly?: boolean;
  }>;
  isPersisting: boolean;
  t: TranslateFn;
  translateSystemText: (text: string) => string;
  setLocale: (locale: SupportedLocale | string) => void;
  setLocalization: (settings: Partial<LocalizationSettings>) => void;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (
    value: Date | string | number,
    options?: Intl.DateTimeFormatOptions
  ) => string;
}

const LocalizationContext = createContext<LocalizationContextValue | null>(null);

function safeIntlLocale(locale: SupportedLocale): string {
  return locale === PSEUDO_LOCALE ? DEFAULT_LOCALE : locale;
}

function readStoredLocalization(): LocalizationSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCALIZATION_STORAGE_KEY);
    if (!raw) return null;
    return normalizeLocalizationSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

function browserLocalization(): LocalizationSettings {
  if (typeof navigator === "undefined") return DEFAULT_LOCALIZATION_SETTINGS;
  const candidates = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language];
  return normalizeLocalizationSettings({
    locale: normalizeSupportedLocale(candidates.find(Boolean)),
  });
}

function initialLocalization(): LocalizationSettings {
  return readStoredLocalization() ?? browserLocalization();
}

function persistLocalLocalization(settings: LocalizationSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALIZATION_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Local preference fallback should never block rendering.
  }
}

function formatIcuMessage(message: string, values: MessageValues = {}): string {
  const withPlurals = message.replace(
    /\{(\w+),\s*plural,\s*one\s*\{([^{}]*)\}\s*other\s*\{([^{}]*)\}\s*\}/g,
    (_match, key: string, one: string, other: string) => {
      const raw = Number(values[key]);
      const choice = raw === 1 ? one : other;
      return choice.replace(/#/g, Number.isFinite(raw) ? String(raw) : "0");
    }
  );
  const withSelects = withPlurals.replace(
    /\{(\w+),\s*select,\s*([^{}]+)\}/g,
    (match, key: string, body: string) => {
      const options = [...body.matchAll(/(\w+)\s*\{([^{}]*)\}/g)];
      const selected = String(values[key] ?? "other");
      return (
        options.find(([option]) => option.startsWith(selected))?.[2] ??
        options.find(([option]) => option.startsWith("other"))?.[2] ??
        match
      );
    }
  );
  return withSelects.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    if (value === null || typeof value === "undefined") return "";
    return String(value ?? match);
  });
}

export function LocalizationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [localSettings, setLocalSettings] = useState<LocalizationSettings>(() =>
    initialLocalization()
  );

  const settingsQuery = useQuery({
    queryKey: DESKTOP_SETTINGS_QUERY_KEY,
    queryFn: () => api.get<DesktopSettingsResponse>("/api/desktop/settings"),
    enabled: Boolean(user),
    staleTime: 30_000,
  });

  const activeSettings = normalizeLocalizationSettings(
    settingsQuery.data?.localization ?? localSettings,
    localSettings
  );

  const mutation = useMutation({
    mutationFn: (next: LocalizationSettings) => {
      const payload: Partial<DesktopSettingsResponse> & {
        localization: LocalizationSettings;
        updatedAt?: string | null;
      } = { localization: next };
      if (settingsQuery.data) payload.updatedAt = settingsQuery.data.updatedAt ?? null;
      return api.put<DesktopSettingsResponse>("/api/desktop/settings", payload);
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: DESKTOP_SETTINGS_QUERY_KEY });
      const previous = queryClient.getQueryData<DesktopSettingsResponse>(
        DESKTOP_SETTINGS_QUERY_KEY
      );
      if (previous) {
        queryClient.setQueryData<DesktopSettingsResponse>(
          DESKTOP_SETTINGS_QUERY_KEY,
          { ...previous, localization: next }
        );
      }
      return { previous };
    },
    onError: (_error, _next, context) => {
      if (context?.previous) {
        queryClient.setQueryData(DESKTOP_SETTINGS_QUERY_KEY, context.previous);
      }
    },
    onSuccess: (result) => {
      queryClient.setQueryData(DESKTOP_SETTINGS_QUERY_KEY, result);
    },
  });

  const setLocalization = useCallback(
    (input: Partial<LocalizationSettings>) => {
      const next = normalizeLocalizationSettings(
        { ...activeSettings, ...input },
        activeSettings
      );
      setLocalSettings(next);
      persistLocalLocalization(next);
      if (user) mutation.mutate(next);
    },
    [activeSettings, mutation, user]
  );

  const setLocale = useCallback(
    (locale: SupportedLocale | string) => {
      const normalizedLocale = normalizeSupportedLocale(locale);
      setLocalization({
        locale: normalizedLocale,
        region: LOCALE_METADATA[normalizedLocale].defaultRegion,
      });
    },
    [setLocalization]
  );

  useEffect(() => {
    const root = document.documentElement;
    root.lang = activeSettings.locale;
    root.dir = localeDirection(activeSettings.locale);
    root.dataset.wtfLocale = activeSettings.locale;
  }, [activeSettings.locale]);

  const t = useCallback<TranslateFn>(
    (id, values) => {
      const catalog = catalogs[activeSettings.locale] ?? enUSCatalog;
      return formatIcuMessage(catalog[id] ?? enUSCatalog[id] ?? id, values);
    },
    [activeSettings.locale]
  );

  const translateSystemText = useCallback(
    (text: string) => {
      const id = systemTextMessageIds[text];
      return id ? t(id) : text;
    },
    [t]
  );

  const intlLocale = safeIntlLocale(activeSettings.locale);
  const value = useMemo<LocalizationContextValue>(
    () => ({
      locale: activeSettings.locale,
      region: activeSettings.region,
      direction: localeDirection(activeSettings.locale),
      settings: activeSettings,
      localeOptions: SUPPORTED_LOCALES.map((locale) => ({
        locale,
        englishName: LOCALE_METADATA[locale].englishName,
        nativeName: LOCALE_METADATA[locale].nativeName,
        testingOnly: LOCALE_METADATA[locale].testingOnly,
      })),
      isPersisting: mutation.isPending,
      t,
      translateSystemText,
      setLocale,
      setLocalization,
      formatNumber: (input, options) =>
        new Intl.NumberFormat(intlLocale, options).format(input),
      formatDate: (input, options) =>
        new Intl.DateTimeFormat(intlLocale, options).format(new Date(input)),
    }),
    [
      activeSettings,
      intlLocale,
      mutation.isPending,
      setLocale,
      setLocalization,
      t,
      translateSystemText,
    ]
  );

  return (
    <LocalizationContext.Provider value={value}>
      {children}
    </LocalizationContext.Provider>
  );
}

export function useLocalization(): LocalizationContextValue {
  const context = useContext(LocalizationContext);
  if (!context) {
    throw new Error("useLocalization must be used inside LocalizationProvider");
  }
  return context;
}
