import type { SupportedLanguage } from '../lib/i18n';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: 'student' | 'admin' };
      language?: SupportedLanguage;
    }
  }
}

export {};
