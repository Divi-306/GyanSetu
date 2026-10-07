import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../src/db/pool';

// Usage: npm run seed
async function main() {
  const sql = await fs.readFile(path.resolve('db/seed/seed.sql'), 'utf8');
  await pool.query(sql);
  console.log('✔ seed.sql applied');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
