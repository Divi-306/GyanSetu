import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../src/db/pool';
import { buildPacks } from '../src/modules/packs/packBuilder';

// Usage:  npm run seed               (builds packs only where none exist yet)
//         npm run seed -- --rebuild  (publishes a new pack version for everything)
async function main() {
  const rebuild = process.argv.includes('--rebuild');

  const sql = await fs.readFile(path.resolve('db/seed/seed.sql'), 'utf8');
  await pool.query(sql);
  console.log('✔ seed.sql applied');

  const { rows } = await pool.query<{ id: string; has_pack: boolean }>(
    `SELECT c.id, EXISTS (SELECT 1 FROM learning_packs p WHERE p.kind = 'course' AND p.course_id = c.id) AS has_pack
       FROM courses c WHERE c.is_published ORDER BY c.sort_order`,
  );
  for (const { id, has_pack } of rows) {
    if (has_pack && !rebuild) {
      console.log(`• packs for ${id} already exist (use --rebuild for a new version)`);
      continue;
    }
    const [full] = await buildPacks('course', id, 'Initial release');
    console.log(`✔ packs built for ${id} (v${full.version})`);
  }

  const starter = await pool.query("SELECT 1 FROM learning_packs WHERE kind = 'starter' LIMIT 1");
  if (starter.rowCount === 0 || rebuild) {
    const [full] = await buildPacks('starter', null, 'Initial starter bundle');
    console.log(`✔ starter pack built (v${full.version})`);
  } else {
    console.log('• starter pack already exists');
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
