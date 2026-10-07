import { Router } from 'express';
import { z } from 'zod';
import { queryOne } from '../../db/pool';
import { requireAdmin, requireAuth } from '../../middleware/auth';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

// PUT /v1/admin/scholarships/:id (upsert by id)
const ScholarshipBody = z.object({
  name: z.string().min(3).max(200),
  provider: z.string().min(2).max(200),
  description: z.string().max(3000).nullable().default(null),
  amountText: z.string().max(200).nullable().default(null),
  eligibilityRules: z.object({
    all: z.array(
      z.object({
        field: z.enum(['age', 'gender', 'category', 'annualFamilyIncome', 'state', 'educationLevel', 'isPwd']),
        op: z.enum(['eq', 'in', 'lte', 'gte']),
        value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
        label: z.string().min(3).max(200),
      }),
    ),
  }),
  deadline: z.iso.date().nullable().default(null),
  applyUrl: z.url(),
  sourceUrl: z.url(),
  lastVerifiedAt: z.iso.datetime({ offset: true }),
  isActive: z.boolean().default(true),
});

adminRouter.put('/scholarships/:id', async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const b = ScholarshipBody.parse(req.body);
  const row = await queryOne(
    `INSERT INTO scholarships (id, name, provider, description, amount_text, eligibility_rules, deadline,
                               apply_url, source_url, last_verified_at, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, provider = EXCLUDED.provider,
       description = EXCLUDED.description, amount_text = EXCLUDED.amount_text,
       eligibility_rules = EXCLUDED.eligibility_rules, deadline = EXCLUDED.deadline,
       apply_url = EXCLUDED.apply_url, source_url = EXCLUDED.source_url,
       last_verified_at = EXCLUDED.last_verified_at, is_active = EXCLUDED.is_active, updated_at = now()
     RETURNING *`,
    [id, b.name, b.provider, b.description, b.amountText, JSON.stringify(b.eligibilityRules), b.deadline,
     b.applyUrl, b.sourceUrl, b.lastVerifiedAt, b.isActive],
  );
  res.json({ scholarship: row });
});

// GET /v1/admin/stats
adminRouter.get('/stats', async (_req, res) => {
  const row = await queryOne(
    `SELECT (SELECT count(*)::int FROM users) AS users,
            (SELECT count(*)::int FROM sync_events WHERE received_at > now() - interval '1 day') AS sync_items_24h,
            (SELECT count(*)::int FROM quiz_attempts) AS quiz_attempts,
            (SELECT count(*)::int FROM quiz_attempts WHERE client_score <> server_score) AS score_mismatches,
            (SELECT count(*)::int FROM ai_questions WHERE created_at > now() - interval '1 day') AS ai_questions_24h,
            (SELECT count(*)::int FROM storage_events WHERE event_type = 'archived') AS packs_archived`,
  );
  res.json(row);
});
