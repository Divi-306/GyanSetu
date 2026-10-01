export type RuleField = 'age' | 'gender' | 'category' | 'annualFamilyIncome' | 'state' | 'educationLevel' | 'isPwd';
export type Rule = {
  field: RuleField;
  op: 'eq' | 'in' | 'lte' | 'gte';
  value: string | number | boolean | (string | number)[];
  label: string;
};
export type RuleSet = { all: Rule[] };

export type MatchProfile = {
  dateOfBirth: string | null;
  gender: string | null;
  category: string | null;
  annualFamilyIncome: number | null;
  state: string | null;
  educationLevel: string | null;
  isPwd: boolean | null;
};

/** Age in whole years. dob is 'YYYY-MM-DD'; parsed by hand so no timezone can shift the day. */
export function ageOn(dob: string, today = new Date()): number {
  const [y, m, d] = dob.split('-').map(Number);
  let age = today.getFullYear() - y;
  const month = today.getMonth() + 1;
  if (month < m || (month === m && today.getDate() < d)) age--;
  return age;
}

function valueOf(p: MatchProfile, field: RuleField): string | number | boolean | null {
  switch (field) {
    case 'age': return p.dateOfBirth ? ageOn(p.dateOfBirth) : null;
    // "Prefer not to say" is missing information, not a mismatch.
    case 'gender': return p.gender === 'prefer_not' ? null : p.gender;
    case 'category': return p.category;
    case 'annualFamilyIncome': return p.annualFamilyIncome;
    case 'state': return p.state?.toLowerCase() ?? null;
    case 'educationLevel': return p.educationLevel;
    case 'isPwd': return p.isPwd;
  }
}

const norm = (v: string | number | boolean) => (typeof v === 'string' ? v.toLowerCase() : v);

function test(actual: string | number | boolean, rule: Rule): boolean {
  const a = norm(actual);
  switch (rule.op) {
    case 'eq': return !Array.isArray(rule.value) && a === norm(rule.value);
    case 'in': return Array.isArray(rule.value) && rule.value.map(norm).includes(a as never);
    case 'lte': return typeof a === 'number' && a <= Number(rule.value);
    case 'gte': return typeof a === 'number' && a >= Number(rule.value);
  }
}

export function evaluate(profile: MatchProfile, rules: RuleSet) {
  const reasons = rules.all.map((rule) => {
    const actual = valueOf(profile, rule.field);
    return { label: rule.label, field: rule.field, met: actual === null ? null : test(actual, rule) };
  });
  const status = reasons.some((r) => r.met === false)
    ? 'not_eligible'
    : reasons.some((r) => r.met === null)
      ? 'check_details'
      : 'likely_eligible';
  return {
    status: status as 'likely_eligible' | 'check_details' | 'not_eligible',
    reasons,
    missingFields: [...new Set(reasons.filter((r) => r.met === null).map((r) => r.field))],
  };
}
