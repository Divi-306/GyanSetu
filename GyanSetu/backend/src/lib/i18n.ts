import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Request } from 'express';

export const SUPPORTED_LANGUAGES = ['en', 'hi', 'mr', 'bn', 'ta', 'te', 'gu'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

const LOCALE_DIR = path.resolve(__dirname, '../locales');

function loadLocale(language: SupportedLanguage) {
  const file = path.join(LOCALE_DIR, `${language}.json`);
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, any>;
}

const locales = {
  en: loadLocale('en'),
  hi: loadLocale('hi'),
  mr: loadLocale('mr'),
  bn: loadLocale('bn'),
  ta: loadLocale('ta'),
  te: loadLocale('te'),
  gu: loadLocale('gu'),
} as const;

export function normalizeLanguage(value?: string | string[] | null): SupportedLanguage {
  const candidate = Array.isArray(value) ? value[0] : value;
  const raw = String(candidate ?? '').trim().toLowerCase();
  const code = raw.split('-')[0].split(',')[0];
  if (code && SUPPORTED_LANGUAGES.includes(code as SupportedLanguage)) return code as SupportedLanguage;
  return DEFAULT_LANGUAGE;
}

export function resolveRequestLanguage(req: Request): SupportedLanguage {
  return normalizeLanguage(req.headers['accept-language'] ?? req.headers['x-language'] ?? undefined);
}

function getValue(locale: Record<string, any>, key: string): string | undefined {
  const parts = key.split('.');
  let current: any = locale;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return typeof current === 'string' ? current : undefined;
}

export function translate(language: SupportedLanguage | string | undefined, key: string, params: Record<string, string | number> = {}): string {
  const localeCode = normalizeLanguage(language ?? DEFAULT_LANGUAGE);
  const locale = locales[localeCode] ?? locales[DEFAULT_LANGUAGE];
  const text = getValue(locale, key) ?? getValue(locales[DEFAULT_LANGUAGE], key) ?? key;
  return Object.entries(params).reduce(
    (value, [name, replacement]) =>
      value.replace(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'g'), String(replacement)),
    text,
  );
}

export const LANGUAGE_LABELS = {
  en: 'English',
  hi: 'हिन्दी',
  mr: 'मराठी',
  bn: 'বাংলা',
  ta: 'தமிழ்',
  te: 'తెలుగు',
  gu: 'ગુજરાતી',
} as const;
