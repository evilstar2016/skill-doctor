import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import enUS from './en-US.json';
import zhCN from './zh-CN.json';

export const supportedLocales = ['zh-CN', 'en-US'] as const;
export type Locale = typeof supportedLocales[number];
type TranslationValues = Record<string, string | number>;
type Translation = (key: keyof typeof zhCN, values?: TranslationValues) => string;

const dictionaries: Record<Locale, Record<string, string>> = { 'zh-CN': zhCN, 'en-US': enUS };
const storageKey = 'skill-doctor-locale';
const I18nContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void; t: Translation } | null>(null);

function initialLocale(): Locale {
  const saved = localStorage.getItem(storageKey);
  if (saved === 'zh-CN' || saved === 'en-US') return saved;
  return 'zh-CN';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  useEffect(() => {
    document.documentElement.lang = locale;
    localStorage.setItem(storageKey, locale);
  }, [locale]);
  const value = useMemo(() => ({
    locale,
    setLocale,
    t: (key: keyof typeof zhCN, values: TranslationValues = {}) => {
      const text = dictionaries[locale][key] ?? dictionaries['zh-CN'][key] ?? key;
      return text.replace(/{{(\w+)}}/g, (_, name: string) => String(values[name] ?? `{{${name}}}`));
    },
  }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useTranslation must be used inside I18nProvider');
  return value;
}
