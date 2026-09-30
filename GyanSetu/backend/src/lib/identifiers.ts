import { badRequest } from './errors';

export type Identifier = { kind: 'email'; value: string } | { kind: 'phone'; value: string };

/** Accepts "Name@Mail.com", "98765 43210", "+91-98765-43210", "919876543210". */
export function parseIdentifier(raw: string): Identifier {
  const s = raw.trim();
  if (s.includes('@')) return { kind: 'email', value: s.toLowerCase() };
  return { kind: 'phone', value: normalizePhone(s) };
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  throw badRequest('INVALID_PHONE', 'Enter a valid 10-digit Indian mobile number');
}
