import { describe, expect, it } from 'vitest';
import { ageOn, evaluate, type MatchProfile, type RuleSet } from '../src/modules/scholarships/eligibility';

const base: MatchProfile = {
  dateOfBirth: null, gender: null, category: null, annualFamilyIncome: null,
  state: null, educationLevel: null, isPwd: null,
};
const rules: RuleSet = {
  all: [
    { field: 'category', op: 'in', value: ['SC'], label: 'SC' },
    { field: 'annualFamilyIncome', op: 'lte', value: 250000, label: 'Income' },
  ],
};

describe('scholarship eligibility', () => {
  it('computes age from a YYYY-MM-DD date without timezone drift', () => {
    expect(ageOn('2005-10-01', new Date(2026, 9, 1))).toBe(21);
    expect(ageOn('2005-10-02', new Date(2026, 9, 1))).toBe(20);
  });

  it('classifies likely / check details / not eligible', () => {
    expect(evaluate({ ...base, category: 'SC', annualFamilyIncome: 200000 }, rules).status).toBe('likely_eligible');
    const partial = evaluate({ ...base, category: 'sc' }, rules);
    expect(partial.status).toBe('check_details');
    expect(partial.missingFields).toEqual(['annualFamilyIncome']);
    expect(evaluate({ ...base, category: 'OBC' }, rules).status).toBe('not_eligible');
  });

  it('treats "prefer not to say" as missing, not as a mismatch', () => {
    const r: RuleSet = { all: [{ field: 'gender', op: 'eq', value: 'female', label: 'Girl student' }] };
    expect(evaluate({ ...base, gender: 'prefer_not' }, r).status).toBe('check_details');
  });
});
