import { Router } from 'express';
import { z } from 'zod';
import { pool, queryOne } from '../../db/pool';
import { notFound } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';
import { USER_COLUMNS, toPublicUser, type UserRow } from '../auth/auth.service';

export const usersRouter = Router();
usersRouter.use(requireAuth);

// GET /v1/me
usersRouter.get('/', async (req, res) => {
  const user = await queryOne<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [req.user!.id]);
  if (!user) throw notFound('User');
  res.json({ user: toPublicUser(user) });
});

// PATCH /v1/me
const PatchMe = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  preferredLanguage: z.enum(['en', 'hi', 'mr', 'bn', 'ta', 'te', 'gu']).optional(),
});

usersRouter.patch('/', async (req, res) => {
  const body = PatchMe.parse(req.body);
  const user = await queryOne<UserRow>(
    `UPDATE users
        SET name = COALESCE($2, name),
            preferred_language = COALESCE($3, preferred_language),
            updated_at = now()
      WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [req.user!.id, body.name ?? null, body.preferredLanguage ?? null],
  );
  res.json({ user: toPublicUser(user!) });
});

// DELETE /v1/me: account + all student data (right to erasure, DPDP Act 2023)
usersRouter.delete('/', async (req, res) => {
  await pool.query('DELETE FROM users WHERE id = $1', [req.user!.id]);
  res.status(204).end();
});

// GET /v1/me/profile
usersRouter.get('/profile', async (req, res) => {
  const p = await queryOne<Record<string, unknown>>(
    'SELECT * FROM student_profiles WHERE user_id = $1',
    [req.user!.id],
  );
  res.json({ profile: p ? toProfileDto(p) : null });
});

// PUT /v1/me/profile (full replace; send every field, null = unknown)
const ProfileBody = z.object({
  dateOfBirth: z.iso.date().nullable(),
  gender: z.enum(['female', 'male', 'other', 'prefer_not']).nullable(),
  state: z.string().trim().max(60).nullable(),
  category: z.enum(['GEN', 'OBC', 'SC', 'ST', 'EWS']).nullable(),
  annualFamilyIncome: z.number().int().min(0).max(100_000_000).nullable(),
  educationLevel: z.enum(['school', 'diploma', 'undergraduate', 'postgraduate']).nullable(),
  institution: z.string().trim().max(120).nullable(),
  currentCourse: z.string().trim().max(120).nullable(),
  semester: z.number().int().min(1).max(12).nullable(),
  isPwd: z.boolean().nullable(),
  interests: z.array(z.string().trim().max(40)).max(20),
  goals: z.string().trim().max(500).nullable(),
  dataConsent: z.boolean(),
});

usersRouter.put('/profile', async (req, res) => {
  const b = ProfileBody.parse(req.body);
  const p = await queryOne<Record<string, unknown>>(
    `INSERT INTO student_profiles AS sp (
        user_id, date_of_birth, gender, state, category, annual_family_income, education_level,
        institution, current_course, semester, is_pwd, interests, goals, data_consent_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, CASE WHEN $14 THEN now() END, now())
     ON CONFLICT (user_id) DO UPDATE SET
        date_of_birth = EXCLUDED.date_of_birth, gender = EXCLUDED.gender, state = EXCLUDED.state,
        category = EXCLUDED.category, annual_family_income = EXCLUDED.annual_family_income,
        education_level = EXCLUDED.education_level, institution = EXCLUDED.institution,
        current_course = EXCLUDED.current_course, semester = EXCLUDED.semester, is_pwd = EXCLUDED.is_pwd,
        interests = EXCLUDED.interests, goals = EXCLUDED.goals,
        data_consent_at = CASE WHEN $14 THEN COALESCE(sp.data_consent_at, now()) END,
        updated_at = now()
     RETURNING *`,
    [
      req.user!.id, b.dateOfBirth, b.gender, b.state, b.category, b.annualFamilyIncome,
      b.educationLevel, b.institution, b.currentCourse, b.semester, b.isPwd, b.interests, b.goals,
      b.dataConsent,
    ],
  );
  res.json({ profile: toProfileDto(p!) });
});

export function toProfileDto(p: Record<string, any>) {
  return {
    dateOfBirth: p.date_of_birth ?? null, // 'YYYY-MM-DD' (DATE parser in db/pool.ts)
    gender: p.gender,
    state: p.state,
    category: p.category,
    annualFamilyIncome: p.annual_family_income,
    educationLevel: p.education_level,
    institution: p.institution,
    currentCourse: p.current_course,
    semester: p.semester,
    isPwd: p.is_pwd,
    interests: p.interests ?? [],
    goals: p.goals,
    dataConsent: Boolean(p.data_consent_at),
  };
}
