import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../src/config/env';
import { pool } from '../src/db/pool';
import { buildPacks } from '../src/modules/packs/packBuilder';

// Usage:  npm run seed               (builds packs only where they are missing)
//         npm run seed -- --rebuild  (publishes a new pack version for everything)

/**
 * True when the newest published pack exists in the database AND its files are
 * on disk. A database without files (storage folder deleted, new machine
 * sharing a database) would otherwise make every download fail.
 */
async function packUsable(kind: 'course' | 'starter', courseId: string | null): Promise<boolean> {
  const { rows } = await pool.query<{ storage_prefix: string }>(
    `SELECT storage_prefix FROM learning_packs
      WHERE kind = $1 AND course_id IS NOT DISTINCT FROM $2 AND is_published
      ORDER BY version DESC LIMIT 1`,
    [kind, courseId],
  );
  return rows.length > 0 && existsSync(path.resolve(env.PACK_STORAGE_DIR, rows[0].storage_prefix, 'pack.json'));
}

async function main() {
  const rebuild = process.argv.includes('--rebuild');

  const sql = await fs.readFile(path.resolve('db/seed/seed.sql'), 'utf8');
  await pool.query(sql);
  console.log('✔ seed.sql applied');

  const { rows } = await pool.query<{ id: string }>('SELECT id FROM courses WHERE is_published ORDER BY sort_order');
  for (const { id } of rows) {
    if (!rebuild && (await packUsable('course', id))) {
      console.log(`• packs for ${id} already exist (use --rebuild for a new version)`);
      continue;
    }
    const [full] = await buildPacks('course', id, 'Initial release');
    console.log(`✔ packs built for ${id} (v${full.version})`);
  }

  if (!rebuild && (await packUsable('starter', null))) {
    console.log('• starter pack already exists');
  } else {
    const [full] = await buildPacks('starter', null, 'Initial starter bundle');
    console.log(`✔ starter pack built (v${full.version})`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
