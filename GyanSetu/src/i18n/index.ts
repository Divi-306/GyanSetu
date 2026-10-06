import { kvGet, kvSet } from '@/db';
import { useApp } from '@/stores/appStore';
import type { SupportedLanguage } from '@/stores/appStore';
import en from './locales/en.json';
import hi from './locales/hi.json';
import mr from './locales/mr.json';
import bn from './locales/bn.json';
import ta from './locales/ta.json';
import te from './locales/te.json';
import gu from './locales/gu.json';
import { getScreenExtra } from './screenExtras';

export const SUPPORTED_LANGUAGES = ['en', 'hi', 'mr', 'bn', 'ta', 'te', 'gu'] as const;
export type { SupportedLanguage };
export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';
export const LANGUAGE_KEY = 'settings.language';

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English',
  hi: 'हिन्दी',
  mr: 'मराठी',
  bn: 'বাংলা',
  ta: 'தமிழ்',
  te: 'తెలుగు',
  gu: 'ગુજરાતી',
};

const resources = { en, hi, mr, bn, ta, te, gu } as const;

export function normalizeLanguage(value?: string | null): SupportedLanguage {
  const raw = String(value ?? '').trim().toLowerCase();
  const code = raw.split('-')[0].split(',')[0];
  if (code && SUPPORTED_LANGUAGES.includes(code as SupportedLanguage)) return code as SupportedLanguage;
  return DEFAULT_LANGUAGE;
}

function getValue(locale: Record<string, any>, key: string): string | undefined {
  const segments = key.split('.');
  let current: any = locale;
  for (const segment of segments) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[segment];
  }
  return typeof current === 'string' ? current : undefined;
}

export function translate(key: string, language: SupportedLanguage = DEFAULT_LANGUAGE, params: Record<string, string | number> = {}): string {
  const locale = resources[language] ?? resources[DEFAULT_LANGUAGE];
  const text = getValue(locale, key) ?? getScreenExtra(key, language) ?? getValue(resources[DEFAULT_LANGUAGE], key) ?? key;
  return Object.entries(params).reduce((value, [name, replacement]) => value.replace(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'g'), String(replacement)), text);
}

export async function loadPreferredLanguage(): Promise<SupportedLanguage> {
  const saved = await kvGet<string | undefined>(LANGUAGE_KEY);
  const language = normalizeLanguage(saved ?? useApp.getState().user?.preferredLanguage ?? undefined);
  useApp.getState().setLanguage(language);
  return language;
}

export async function persistPreferredLanguage(language: SupportedLanguage): Promise<SupportedLanguage> {
  const next = normalizeLanguage(language);
  useApp.getState().setLanguage(next);
  await kvSet(LANGUAGE_KEY, next);
  return next;
}

export function useTranslation() {
  const language = useApp((state) => state.language);
  return {
    language,
    t: (key: string, params?: Record<string, string | number>) => translate(key, language, params ?? {}),
  };
}
