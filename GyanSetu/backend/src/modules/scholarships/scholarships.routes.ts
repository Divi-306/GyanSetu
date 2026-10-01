import { Router } from 'express';
import { z } from 'zod';
import { pool, queryOne } from '../../db/pool';
import { notFound } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';
import { toProfileDto } from '../users/users.routes';
import { evaluate, type MatchProfile, type RuleSet } from './eligibility';

export const scholarshipsRouter = Router();
scholarshipsRouter.use(requireAuth);

const ORDER = { likely_eligible: 0, check_details: 1, not_eligible: 2 } as const;
const DISCLAIMER =
  'Matches are indicative only, based on your profile and data last verified on the date shown. Always confirm eligibility on the official website before applying.';

const EMPTY: MatchProfile = {
  dateOfBirth: null, gender: null, category: null, annualFamilyIncome: null,
  state: null, educationLevel: null, isPwd: null,
};

/** The student's profile for matching, or null if there is none or they haven't consented. */
async function loadMatchProfile(userId: string): Promise<MatchProfile | null> {
  const row = await queryOne<Record<string, unknown>>('SELECT * FROM student_profiles WHERE user_id = $1', [userId]);
  if (!row) return null;
  const p = toProfileDto(row);
  if (!p.dataConsent) return null; // no consent → don't use sensitive fields
  return p;
}

function toDto(s: Record<string, any>, profile: MatchProfile) {
  return {
    id: s.id,
    name: s.name,
    provider: s.provider,
    description: s.description,
    amount: s.amount_text,
    deadline: s.deadline,
    applyUrl: s.apply_url,
    sourceUrl: s.source_url,
    lastVerifiedAt: s.last_verified_at,
    match: evaluate(profile, s.eligibility_rules as RuleSet),
  };
}

// GET /v1/scholarships
scholarshipsRouter.get('/', async (req, res) => {
  const profile = await loadMatchProfile(req.user!.id);
  const { rows } = await pool.query(
    `SELECT id, name, provider, description, amount_text, eligibility_rules, deadline,
            apply_url, source_url, last_verified_at
       FROM scholarships
      WHERE is_active AND (deadline IS NULL OR deadline >= current_date)
      ORDER BY deadline NULLS LAST, name`,
  );

  const items = rows
    .map((s) => toDto(s, profile ?? EMPTY))
    .sort((a, b) => ORDER[a.match.status] - ORDER[b.match.status]);

  res.json({ fetchedAt: new Date().toISOString(), profileComplete: profile !== null, disclaimer: DISCLAIMER, scholarships: items });
});

// GET /v1/scholarships/:id
scholarshipsRouter.get('/:id', async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const s = await queryOne<Record<string, any>>('SELECT * FROM scholarships WHERE id = $1 AND is_active', [id]);
  if (!s) throw notFound('Scholarship');
  const profile = (await loadMatchProfile(req.user!.id)) ?? EMPTY;
  res.json({ scholarship: toDto(s, profile), disclaimer: DISCLAIMER });
});
