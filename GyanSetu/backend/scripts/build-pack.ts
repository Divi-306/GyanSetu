import { pool } from '../src/db/pool';
import { buildPacks } from '../src/modules/packs/packBuilder';

// Usage:  npm run build-pack -- python        |   npm run build-pack -- --starter
async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error('Usage: build-pack <courseId> | --starter');
  const manifests = arg === '--starter' ? await buildPacks('starter', null) : await buildPacks('course', arg);
  for (const m of manifests) {
    console.log(`✔ ${m.kind} ${m.courseId ?? ''} v${m.version} ${m.variant}: ${m.files.length} files, ${m.totalBytes} bytes`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
