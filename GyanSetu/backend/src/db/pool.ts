import { Pool, types, type PoolClient, type QueryResultRow } from 'pg';
import { env } from '../config/env';

// Postgres BIGINT (OID 20) comes back as a string by default. Our byte sizes
// fit comfortably in a JS number, so parse them.
types.setTypeParser(20, (v) => Number(v));
// DATE (OID 1082) → keep 'YYYY-MM-DD'. The default converts to a JS Date at
// local midnight, which shifts the day when serialised in a +05:30 timezone.
types.setTypeParser(1082, (v) => v);

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
});

export type Db = Pick<PoolClient, 'query'>;

export async function withTransaction<T>(fn: (db: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
  db: Db = pool,
): Promise<T | undefined> {
  const { rows } = await db.query<T>(text, params);
  return rows[0];
}
